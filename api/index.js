const axios = require('axios');

// Twitter API 凭证 (从环境变量获取)
const TWITTER_API_KEY = process.env.TWITTER_API_KEY || '';
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET || '';
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || '';
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET || '';

// 马斯克的 Twitter ID (@elonmusk)
const ELON_MUSK_USER_ID = '44196397';

// 市场ID (需要从 Polymarket 获取实际ID)
const POLYMARKET_MARKETS = {
    musk_tweets_week: 'musk-tweets-march-27-april-3-2026',
    musk_tweets_week2: 'musk-tweets-march-31-april-7-2026'
};

/**
 * 获取 Twitter Bearer Token (OAuth2)
 * 需要先在 Twitter Developer Portal 创建 App 获取 API Key 和 Secret
 */
async function getTwitterBearerToken() {
    if (!TWITTER_API_KEY || !TWITTER_API_SECRET) {
        console.log('Twitter credentials not configured');
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
 * 获取用户信息
 */
async function getUserInfo(bearerToken, userId) {
    if (!bearerToken) {
        return null;
    }

    try {
        const response = await axios.get(
            `https://api.twitter.com/2/users/${userId}`,
            {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                },
                params: {
                    'user.fields': 'public_metrics'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error fetching user info:', error.message);
        return null;
    }
}

/**
 * 获取 Polymarket 市场数据 (CLOB API)
 */
async function getPolymarketData() {
    try {
        // 获取活跃市场列表
        const marketsResponse = await axios.get(
            'https://clob.polymarket.com/markets',
            {
                params: {
                    'closed': 'false',
                    'limit': 10
                }
            }
        );

        // 过滤出马斯克推文相关的市场
        const muskMarkets = marketsResponse.data.markets.filter(m => 
            m.question && m.question.toLowerCase().includes('tweet') ||
            m.question && m.question.toLowerCase().includes('musk')
        );

        // 获取每个市场的订单簿数据
        const marketsWithOdds = await Promise.all(
            muskMarkets.map(async (market) => {
                try {
                    const orderBookResponse = await axios.get(
                        `https://clob.polymarket.com/orderbook/${market.id}`
                    );
                    return {
                        id: market.id,
                        question: market.question,
                        endDate: market.endDate,
                        volume: market.volume,
                        liquidity: market.liquidity,
                        orderBook: orderBookResponse.data
                    };
                } catch (e) {
                    return {
                        id: market.id,
                        question: market.question,
                        endDate: market.endDate,
                        volume: market.volume,
                        liquidity: market.liquidity
                    };
                }
            })
        );

        return marketsWithOdds;
    } catch (error) {
        console.error('Error fetching Polymarket data:', error.message);
        return [];
    }
}

/**
 * 获取历史事件数据 (用于推文数量统计)
 * 这是一个示例，需要根据实际市场周期调整
 */
async function getHistoricalTweetData(bearerToken) {
    // 计算本周的 UTC 时间范围
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay() - 6); // 周一
    startOfWeek.setUTCHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 7); // 周日

    // 获取过去7天的数据
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
            count: tweetData?.meta?.result_count || 0
        });
    }

    return historicalData;
}

/**
 * 计算预测数据
 */
function calculatePrediction(historicalData, daysRemaining, targetTotal) {
    // 计算日均发推速率
    const totalTweets = historicalData.reduce((sum, d) => sum + d.count, 0);
    const daysCounted = historicalData.length;
    const dailyRate = totalTweets / daysCounted;
    const hourlyRate = dailyRate / 24;

    // 当前总数 (今天的数据)
    const currentTotal = historicalData[historicalData.length - 1]?.count || 0;
    
    // 预测总数
    const remainingHours = daysRemaining * 24;
    const predictedRemaining = hourlyRate * remainingHours;
    const predictedTotal = currentTotal + predictedRemaining;

    // 计算概率分布 (基于正态分布)
    const ranges = [
        { range: '220-239', min: 220, max: 239 },
        { range: '240-259', min: 240, max: 259, isCenter: true },
        { range: '260-279', min: 260, max: 279 },
        { range: '280-299', min: 280, max: 299 }
    ];

    const probabilities = ranges.map(r => {
        const distance = Math.abs((r.min + r.max) / 2 - predictedTotal);
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

    // 归一化概率
    const totalProb = probabilities.reduce((sum, p) => sum + p.probability, 0);
    probabilities.forEach(p => {
        p.probability = Math.round((p.probability / totalProb) * 1000) / 10;
    });

    return {
        currentTotal,
        dailyRate: Math.round(dailyRate * 10) / 10,
        hourlyRate: Math.round(hourlyRate * 100) / 100,
        predictedTotal: Math.round(predictedTotal),
        probabilities,
        remainingHours,
        daysRemaining
    };
}

// 主 API 路由
module.exports = async function handler(req, res) {
    // 设置 CORS
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
        // 获取 Bearer Token
        const bearerToken = await getTwitterBearerToken();
        
        // 获取 Polymarket 数据
        const polymarketData = await getPolymarketData();
        
        // 获取历史推文数据
        const historicalData = await getHistoricalTweetData(bearerToken);
        
        // 获取用户信息
        const userInfo = await getUserInfo(bearerToken, ELON_MUSK_USER_ID);

        // 计算预测
        const prediction = calculatePrediction(historicalData, 2, 250);

        // 返回综合数据
        const response = {
            success: true,
            timestamp: new Date().toISOString(),
            user: userInfo ? {
                name: userInfo.data?.name,
                username: userInfo.data?.username,
                followers: userInfo.data?.public_metrics?.followers_count,
                tweetCount: userInfo.data?.public_metrics?.tweet_count
            } : null,
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
