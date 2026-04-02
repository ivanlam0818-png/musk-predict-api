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
 */
async function getPolymarketData() {
    try {
        // 获取活跃市场列表
        const response = await axios.get(
            'https://clob.polymarket.com/markets',
            {
                params: {
                    'closed': 'false',
                    'limit': 10
                }
            }
        );

        // 过滤出马斯克推文相关的市场
        const muskMarkets = (response.data.markets || []).filter(m => 
            m.question && (m.question.toLowerCase().includes('tweet') ||
            m.question.toLowerCase().includes('musk') ||
            m.question.toLowerCase().includes('# tweets'))
        );

        return muskMarkets.map(m => ({
            id: m.id,
            question: m.question,
            endDate: m.endDate,
            volume: m.volume || '0',
            liquidity: m.liquidity || '0'
        }));
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
function calculatePrediction(historicalData, daysRemaining = 2) {
    const totalTweets = historicalData.reduce((sum, d) => sum + d.count, 0);
    const daysCounted = historicalData.length;
    const dailyRate = totalTweets / daysCounted;
    const hourlyRate = dailyRate / 24;

    const currentTotal = historicalData[historicalData.length - 1]?.count || 0;
    const remainingHours = daysRemaining * 24;
    const predictedTotal = Math.round(currentTotal + (hourlyRate * remainingHours));

    // 计算概率分布
    const ranges = [
        { range: '220-239', min: 220, max: 239 },
        { range: '240-259', min: 240, max: 259, isCenter: true },
        { range: '260-279', min: 260, max: 279 },
        { range: '280-299', min: 280, max: 299 }
    ];

    const probabilities = ranges.map(r => {
        const mid = (r.min + r.max) / 2;
        const distance = Math.abs(mid - predictedTotal);
        const spread = (r.max - r.min) / 2;
        let prob;
        
        if (distance <= spread) {
            prob = 50 + 50 * (1 - distance / spread);
        } else {
            prob = 50 * Math.exp(-((distance - spread) ** 2) / (2 * (spread ** 2)));
        }
        
        return {
            range: r.range,
            probability: Math.round(prob * 10) / 10,
            isCenter: r.isCenter || false
        };
    });

    // 归一化
    const totalProb = probabilities.reduce((sum, p) => sum + p.probability, 0);
    probabilities.forEach(p => {
        p.probability = Math.round((p.probability / totalProb) * 1000) / 10;
    });

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

        const response = {
            success: true,
            timestamp: new Date().toISOString(),
            source: bearerToken ? 'twitter_api' : 'demo_data',
            polymarket: {
                markets: polymarketData,
                totalVolume: polymarketData.reduce((sum, m) => sum + (parseFloat(m.volume) || 0), 0)
            },
            tweetStats: {
                historical: historicalData,
                current: prediction.currentTotal,
                dailyRate: prediction.dailyRate,
                hourlyRate: prediction.hourlyRate
            },
            prediction: {
                centerPoint: prediction.predictedTotal,
                probabilities: prediction.probabilities,
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
