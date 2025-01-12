const jwt = require('jsonwebtoken')
const { User, Tweet, Reply, Like, sequelize } = require('../models')
const { getOffset, getUser } = require('../_helpers')

const superUser = { name: 'root', email: 'root@example.com' }

const adminController = {
  adminLogin: async (req, res, next) => {
    try {
      // token(效期30天)
      const userData = getUser(req).toJSON()
      if (userData.role !== 'admin') return res.status(401).json({ status: 'error', message: '帳號不存在！' })
      delete userData.password
      const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '30d' })
      return res.status(200).json({
        status: 'success',
        data: {
          token,
          user: userData
        }
      })
    } catch (err) {
      next(err)
    }
  },
  getUsers: async (req, res, next) => {
    try {
      const DEFAULT_LIMIT = 10
      const page = Number(req.query.page) || 1
      const limit = Number(req.query.limit) || DEFAULT_LIMIT
      const offset = getOffset(limit, page)

      const users = await User.findAll({
        attributes: ['id', 'name', 'account', 'avatar', 'cover',
          [sequelize.literal('(SELECT COUNT(*) FROM Tweets WHERE Tweets.UserId = User.id)'), 'tweetsCount'],
          [sequelize.literal('(SELECT COUNT(*) FROM Tweets JOIN Likes on Tweets.id = Likes.TweetId WHERE Tweets.UserId = User.id)'), 'tweetsLikedCount'],
          [sequelize.literal('(SELECT COUNT(*) FROM Followships WHERE Followships.followerId = User.id)'), 'followingCount'],
          [sequelize.literal('(SELECT COUNT(*) FROM Followships WHERE Followships.followingId = User.id)'), 'followerCount']
        ],
        order: [[sequelize.literal('tweetsCount'), 'DESC']],
        limit,
        offset,
        nest: true,
        raw: true
      })

      return res.json(users)
    } catch (err) {
      next(err)
    }
  },
  patchUser: async (req, res, next) => {
    try {
      const { role } = req.body
      const { id } = req.params
      const user = await User.findByPk(id)
      if (!user) return res.status(404).json({ status: 'error', message: '找不到使用者！' })
      if (user.email === superUser.email) return res.status(401).json({ status: 'error', message: `禁止變更${superUser.name}權限！` })
      let updatedUser = await user.update({ role })
      updatedUser = updatedUser.toJSON()
      delete updatedUser.password
      delete updatedUser.avatar
      delete updatedUser.cover
      delete updatedUser.introduction

      return res.json({ status: 'success', data: updatedUser })
    } catch (err) {
      next(err)
    }
  },
  getTweets: async (req, res, next) => {
    try {
      const DEFAULT_LIMIT = 10
      const page = Number(req.query.page) || 1
      const limit = Number(req.query.limit) || DEFAULT_LIMIT
      const offset = getOffset(limit, page)

      const tweets = await Tweet.findAll({
        include: { model: User, attributes: ['id', 'name', 'account', 'avatar'] },
        attributes: ['id', 'description', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
        nest: true
      })
      const data = tweets.map(tweet => ({
        ...tweet.toJSON(),
        description: tweet?.description
      }))
      return res.status(200).json(data)
    } catch (err) { next(err) }
  },
  deleteTweet: async (req, res, next) => {
    try {
      const TweetId = Number(req.params.id)

      const tweet = await Tweet.findByPk(TweetId)
      if (!tweet) return res.status(404).json({ status: 'error', message: '找不到推文！' })

      await tweet.destroy()
      await Reply.destroy({ where: { TweetId: tweet.id } })
      await Like.destroy({ where: { TweetId: tweet.id } })

      return res.status(200).json({
        status: 'success',
        data: tweet
      })
    } catch (err) {
      next(err)
    }
  }
}

module.exports = adminController
