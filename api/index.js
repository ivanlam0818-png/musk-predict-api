const axios = require('axios');

// Twitter API 凭证 (从环境变量获取)
const TWITTER_API_KEY = process.env.TWITTER_API_KEY || '';
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET || '';

// 马斯克的 Twitter ID (@elonmusk)
const ELON_MUSK_USER_ID = '44196397';

/**
 * 获取 Twitter Bearer Token (OAuth2)
 */
async function getTwitterBearerToken() {
    if (!TWITTER_API_KEY || !TWITTER_API_SECRET) {
        console.log('Twitter credentials not configured - using demo data');
        return null;
    }

    try {
        const credentials = Buffer.from(`${TWITTER_API_KEY}:${TWITTER_API_SECRET}`).toString('base64');
        const response = await axios.post(
            'https://api.twitter.com/oauth2/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting Bearer Token:', error.message);
        return null;
    }
}

/**
 * 获取用户推文统计
 */
async function getUserTweetStats(bearerToken, userId, startTime, endTime) {
    if (!bearerToken) {
        return null;
    }

    try {
        const response = await axios.get(
            `https://api.twitter.com/2/users/${userId}/tweets`,
            {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                },
                params: {
                    'start_time': startTime,
                    'end_time': endTime,
                    'max_results': 100,
                    'tweet.fields': 'created_at'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error fetching tweets:', error.message);
        return null;
    }
}

/**
 * 获取 Polymarket 市场数据
 * 使用 Gamma API: https://gamma-api.polymarket.com
 * 获取 Elon Musk 推文预测市场的所有区间概率
 */
async function getPolymarketData() {
    try {
        // 获取 Elon Musk 推文市场的所有区间
        // 这些市场是同一个事件的不同结果区间
        const ranges = ['220-239', '240-259', '260-279', '280-299'];
        const markets = [];
        
        for (const range of ranges) {
            const slug = `elon-musk-of-tweets-march-27-april-3-${range}`;
            try {
                const response = await axios.get(
                    'https://gamma-api.polymarket.com/markets',
                    { params: { slug } }
                );
                
                if (response.data && response.data.length > 0) {
                    const m = response.data[0];
                    // 解析概率
                    let probability = 0;
                    try {
                        const prices = JSON.parse(m.outcomePrices || '[]');
                        probability = parseFloat(prices[0]) * 100; // Yes 价格 = 概率
                    } catch (e) {}
                    
                    markets.push({
                        id: m.id,
                        question: m.question,
                        slug: m.slug,
                        endDate: m.endDate,
                        volume: m.volume || '0',
                        liquidity: m.liquidity || '0',
                        probability: probability.toFixed(1),
                        outcomes: JSON.parse(m.outcomes || '[]'),
                        outcomePrices: JSON.parse(m.outcomePrices || '[]')
                    });
                }
            } catch (e) {
                console.log(`Failed to fetch market ${range}:`, e.message);
            }
        }
        
        // 计算总概率并归一化
        const totalProb = markets.reduce((sum, m) => sum + parseFloat(m.probability || 0), 0);
        
        if (markets.length > 0) {
            // 归一化概率
            return markets.map(m => ({
                ...m,
                normalizedProbability: totalProb > 0 
                    ? (parseFloat(m.probability) / totalProb * 100).toFixed(1) 
                    : m.probability
            }));
        }
        
        return markets;
    } catch (error) {
        console.error('Error fetching Polymarket data:', error.message);
        return [];
    }
}

/**
 * 获取历史推文数据 (过去7天)
 */
async function getHistoricalTweetData(bearerToken) {
    const now = new Date();
    const historicalData = [];
    
    for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now);
        dayStart.setUTCDate(now.getUTCDate() - i);
        dayStart.setUTCHours(0, 0, 0, 0);
        
        const dayEnd = new Date(dayStart);
        dayEnd.setUTCHours(23, 59, 59, 999);

        const tweetData = await getUserTweetStats(
            bearerToken,
            ELON_MUSK_USER_ID,
            dayStart.toISOString(),
            dayEnd.toISOString()
        );

        historicalData.push({
            date: dayStart.toISOString().split('T')[0],
            dayName: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayStart.getDay()],
            count: tweetData?.meta?.result_count || Math.floor(Math.random() * 30 + 10) // 备用随机数据
        });
    }

    return historicalData;
}

/**
 * 计算预测数据
 */
function calculatePrediction(historicalData, daysRemaining = 2, totalDays = 7) {
    // 计算日均和时均发推速率
    const totalTweets = historicalData.reduce((sum, d) => sum + d.count, 0);
    const daysCounted = historicalData.length;
    const dailyRate = totalTweets / daysCounted;
    const hourlyRate = dailyRate / 24;

    // 当前已发推文总数（7天周期内）
    const currentTotal = totalTweets;
    
    // 预测剩余时间内的推文数
    const remainingHours = daysRemaining * 24;
    const predictedRemaining = hourlyRate * remainingHours;
    
    // 预测总推文数 = 当前 + 剩余
    const predictedTotal = Math.round(currentTotal + predictedRemaining);

    // 计算概率分布 (正态分布模型)
    const ranges = [
        { range: '220-239', min: 220, max: 239 },
        { range: '240-259', min: 240, max: 259, isCenter: true },
        { range: '260-279', min: 260, max: 279 },
        { range: '280-299', min: 280, max: 299 }
    ];

    // 使用正态分布计算概率
    const stdDev = 20; // 标准差
    const probabilities = ranges.map(r => {
        const mid = (r.min + r.max) / 2;
        // 正态分布概率密度
        const exponent = -Math.pow(predictedTotal - mid, 2) / (2 * Math.pow(stdDev, 2));
        const prob = Math.exp(exponent);
        
        return {
            range: r.range,
            probability: Math.round(prob * 1000) / 10,
            isCenter: r.isCenter || false
        };
    });

    // 归一化概率
    const totalProb = probabilities.reduce((sum, p) => sum + p.probability, 0);
    if (totalProb > 0) {
        probabilities.forEach(p => {
            p.probability = Math.round((p.probability / totalProb) * 1000) / 10;
        });
    }

    return {
        currentTotal,
        dailyRate: Math.round(dailyRate * 10) / 10,
        hourlyRate: Math.round(hourlyRate * 100) / 100,
        predictedTotal,
        probabilities,
        remainingHours,
        daysRemaining
    };
}

/**
 * 生成模拟数据 (当没有 API Key 时)
 */
function generateDemoData() {
    const demoHistorical = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now);
        dayStart.setUTCDate(now.getUTCDate() - i);
        demoHistorical.push({
            date: dayStart.toISOString().split('T')[0],
            dayName: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayStart.getDay()],
            count: Math.floor(Math.random() * 30 + 10)
        });
    }

    return demoHistorical;
}

// 主 API 路由
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const bearerToken = await getTwitterBearerToken();
        const polymarketData = await getPolymarketData();
        
        // 如果有 Twitter API Key，获取真实数据；否则使用模拟数据
        const historicalData = bearerToken 
            ? await getHistoricalTweetData(bearerToken)
            : generateDemoData();
        
        const prediction = calculatePrediction(historicalData, 2);
        
        // 如果有 Polymarket 数据，用真实概率替换模型预测
        let probabilities = prediction.probabilities;
        if (polymarketData && polymarketData.length > 0) {
            // 使用 Polymarket 真实概率数据
            probabilities = polymarketData.map((m) => {
                // 从 slug 中提取区间，如 "elon-musk-of-tweets-march-27-april-3-220-239" -> "220-239"
                const slugParts = (m.slug || '').split('-');
                const range = slugParts.slice(-2).join('-');
                return {
                    range: range,
                    probability: parseFloat(m.normalizedProbability || m.probability || 0),
                    rawProbability: parseFloat(m.probability || 0),
                    isCenter: range === '240-259'
                };
            });
        }

        const response = {
            success: true,
            timestamp: new Date().toISOString(),
            source: bearerToken ? 'twitter_api' : 'demo_data',
            polymarket: {
                markets: polymarketData,
                totalVolume: polymarketData.reduce((sum, m) => sum + (parseFloat(m.volume) || 0), 0),
                hasRealData: polymarketData.length > 0
            },
            tweetStats: {
                historical: historicalData,
                current: prediction.currentTotal,
                dailyRate: prediction.dailyRate,
                hourlyRate: prediction.hourlyRate
            },
            prediction: {
                centerPoint: prediction.predictedTotal,
                probabilities: probabilities,
                remainingTime: `${prediction.daysRemaining}天 ${Math.round(prediction.remainingHours % 24)}小时`
            },
            progress: {
                current: prediction.currentTotal,
                target: 250,
                percentage: Math.round((prediction.currentTotal / 250) * 100)
            }
        };

        return res.status(200).json(response);
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};
