const assert = require('assert')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt-nodejs')
const { User, Reply, Tweet, Like } = require('../models')
const { getUser, imgurFileHandler } = require('../_helpers')

const userController = {
  userLogin: async (req, res, next) => {
    try {
      const { email, password } = req.body
      // 檢查必填欄位
      if (!email.trim() || !password.trim()) {
        return res.json({ status: 'error', message: '所有欄位都是必填！' })
      }

      const user = await User.findOne({ where: { email } })
      // 若找不到該帳號使用者，顯示錯誤訊息
      if (!user) return res.status(401).json({ status: 'error', message: "User doesn't exist!" })
      // 若使用者的權限是admin，則依據角色權限顯示錯誤訊息
      if (user.role === 'admin') return res.status(401).json({ status: 'error', message: '帳號不存在' })
      // 比對密碼是否錯誤
      if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ status: 'error', message: '密碼錯誤！' })
      }
      // token(效期30天)
      const userData = getUser(req).toJSON()
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
  getUser: (req, res, next) => {
    const { id } = req.params
    return User.findByPk(id, {
      include: [
        Reply, Tweet, Like,
        { model: User, as: 'Followers' },
        { model: User, as: 'Followings' }
      ],
      nest: true
    })
      .then(user => {
        if (!user) assert(user, "User doesn't exist!")
        res.json({ status: 'success', data: user })
      })
      .catch(err => next(err))
  },
  getUsers: (req, res, next) => {
    const top = Number(req.query.top)
    const currentUser = getUser(req)
    return User.findAll({
      include: [{ model: User, as: 'Followers' }]
    })
      .then(users => {
        const result = users
          .map(user => ({
            ...user.toJSON(),
            followerCount: user.Followers.length,
            isFollowed: currentUser.Followings.some(f => f.id === user.id)
          }))
          .sort((a, b) => b.followerCount - a.followerCount)
          .slice(0, top || users.length)
        res.json({ status: 'success', data: result })
      })
      .catch(err => next(err))
  },
  postUser: (req, res, next) => {
    const { account, name, email, password, confirmPassword } = req.body
    if (!account || !name || !email || !password || !confirmPassword) throw new Error('所有欄位都是必填！')
    if (password !== confirmPassword) throw new Error('密碼與密碼確認不相同！')

    Promise.all([
      User.findOne({ where: { email } }),
      User.findOne({ where: { account } })
    ])
      .then((user1, user2) => {
        if (user1) assert(user1, 'email 已重複註冊！')
        if (user2) assert(user2, 'account 已重複註冊！')
        return bcrypt.hashSync(password)
      })
      .then(hash => User.create({
        account,
        name,
        email,
        password: hash
      }))
      .then(createdUser => res.json({ status: 'success', data: createdUser }))
      .catch(err => next(err))
  },
  putUser: (req, res, next) => {
    const { id } = req.params
    const { account, name, email, password, confirmPassword, introduction } = req.body
    const { avatar, cover } = req
    if (!account || !name || !email || !password || !confirmPassword) throw new Error('account, name, email, password, confirmPassword必填！')
    if (password !== confirmPassword) throw new Error('密碼與密碼確認不相同！')
    if (getUser(req).id !== id) throw new Error('無權限更改此使用者！')
    return Promise.all([
      User.findByPk(id),
      imgurFileHandler(avatar),
      imgurFileHandler(cover)
    ])
      .then(([user, avatarPath, coverPath]) => {
        if (!user) assert(user, '使用者不存在！')
        return user.update({
          account,
          name,
          email,
          password: bcrypt.hashSync(password),
          avatar: avatarPath || user.avatar,
          cover: coverPath || user.cover,
          introduction: introduction || user.introduction
        })
      })
      .then(updatedUser => res.json({ status: 'success', data: updatedUser }))
      .then(err => next(err))
  }
}

module.exports = userController
