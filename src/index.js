/**
 * 一个使用小微商户+微信聊天机器人构建的私域运营助手
 * https://github.com/rixingyike/wechat-operation-assistant
 * 
 * @copyright 2021 LIYI <9830131@qq.com>
 * 
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 */
const qrTerm = require('qrcode-terminal')
const {
  config,
  Contact,
  Room,
  Wechaty,
  ScanStatus,
  Friendship,
  log,
} = require('wechaty')
const util = require("./util")
const wepay = require("./wepay")
const axios = require('axios').default
const short = require('short-uuid')
const { FileBox } = require('file-box')

// 没有用到，二维码是在线serve的，支付状态是靠查询得知最终状态的
const LOCAL_SERVER = `http://rxyk.free.idcfengye.com`

/// 参数
const data = util.readFile('./data.json') // json object
log.info('data', JSON.stringify(data))

/// 开始
const bot = new Wechaty({
  name: 'wechat-operation-assistant',
})

bot.on("scan", function (qrcode, status) {
  if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
    require('qrcode-terminal').generate(qrcode, { small: true })
  }
})
  .on("login", function (user) {
    log.info('StarterBot', '%s login', user)
  })
  .on("logout", function (user) {
    log.info('StarterBot', '%s logout', user)
  })
  .on("friendship", async (req) => {
    const contact = req.contact()

    if (req.type() === Friendship.Type.Confirm) {
      console.info('New friend ' + contact.name() + ' relationship confirmed!')
      return
    }
    await req.accept()

    setTimeout(
      async _ => {
        let msg = `${data.greeting}
        可以使用如下交互指令：
        1，申请加入xx群，可以加入群，将xx换成具体的关键字，例如书法
        2，#查询2021xxx，用于查询响旧订单，如果支付了可以补拉进群
        3，指定的管理员，可以使用”@xxx 勿发“这样的群消息指令，让机器人踢出某人
        `
        await contact.say(msg)
      },
      3000,
    )

  })
  .on('message', async function (msg) {
    if (msg.age() > 3 * 60) {
      log.info('Bot', 'on(message) skip age("%d") > 3 * 60 seconds: "%s"', msg.age(), msg)
      return
    }

    const room = msg.room()
    const from = msg.talker()
    const text = msg.text()

    if (!from) {
      return
    }

    console.log((room ? '[' + await room.topic() + ']' : '')
      + '<' + from.name() + '>'
      + ':' + msg,
    )

    if (msg.self()) {
      return // skip self
    }

    if (/^退出$/i.test(text)) {
      if (from.name() == data.admin) {
        await bot.logout()
      }
      return
    }

    // #查询${out_trade_no}
    // 用户主动查询支付过的订单
    let userQueryPayerRes = /^#查询(\d{4}\w+)?$/i.exec(text)
    if (userQueryPayerRes) {
      let out_trade_no = userQueryPayerRes[1]
      const usersData = util.readFile('./user.json')
      let userDataObject = usersData[out_trade_no]
      if (userDataObject) {
        userQueryOldOrder(msg, userDataObject)
      }
      return
    }

    // 用户主动申请加群
    let getWorkRes = /^申请加入([\u4E00-\u9FA5]{2,4})?群$/i.exec(text)
    log.info('getWorkRes', getWorkRes)
    if (getWorkRes) {
      let word = getWorkRes[1]//书法
      let groupName = data.words[word]
      log.info("word", word)
      log.info("groupName", groupName)
      if (groupName) {
        dealWithGroup(from, groupName, msg)
      }
      return
    }

    if (room) {
      // ok
      let execKickUserRes = /^@(.*)? 勿发$/i.exec(text)
      log.info('execKickUserRes', execKickUserRes)
      if (execKickUserRes) {
        let toUserName = execKickUserRes[1]
        // 只有机器人可以踢人
        if (from.name() == data.admin) {
          let toContact = await room.member({ name: new RegExp(`^${toUserName}$`, 'i') })
          // if (toContact) room.del(toContact)
          getOutRoom(toContact, room)
        }
        return
      }
    }
  })
  .start()
  .catch(e => console.error(e))

// 处理用户想加入群的需求
async function dealWithGroup(from, groupName, msg, requireCheckPayState = true) {
  const groupReg = new RegExp(`^${groupName}$`, 'i')
  log.info("groupName", groupName)
  const dingRoom = await bot.Room.find({ topic: groupReg })
  log.info("dingRoom", dingRoom)
  if (dingRoom) {
    if (await dingRoom.has(from)) {
      const topic = await dingRoom.topic()
      await dingRoom.say(`已在群内`, from)
      await from.say(`已经在群（"${topic}"）内，艾特你了`)
    } else {
      if (!requireCheckPayState || (requireCheckPayState && await payForGroup(msg, groupName))) {//支付完成，拉群
        await putInRoom(from, dingRoom)
      }
    }
  } else {
    if (!requireCheckPayState || (requireCheckPayState && await payForGroup(msg, groupName))) {//支付完成，拉群
      createAndManageRoom(from, groupName)
    }
  }
}

async function createAndManageRoom(from, groupName) {
  const groupReg = new RegExp(`^${groupName}$`, 'i')
  const newRoom = await createRoom(from, groupName)
  console.log('createRoom id:', newRoom.id)
  await manageRoom(groupReg)
}

// 对新建群的管理
async function manageRoom(groupReg) {
  const room = await bot.Room.find({ topic: groupReg })
  if (!room) {
    log.warn('Bot', 'there is no room topic ding(yet)')
    return
  }
  room.on('join', function (inviteeList, inviter) {
    log.verbose('Bot', 'Room EVENT: join - "%s", "%s"',
      inviteeList.map(c => c.name()).join(', '),
      inviter.name(),
    )
    console.log('room.on(join) id:', this.id)
    checkRoomJoin.call(this, room, inviteeList, inviter)
  })
  room.on('leave', (leaverList, remover) => {
    log.info('Bot', 'Room EVENT: leave - "%s" leave(remover "%s"), byebye', leaverList.join(','), remover || 'unknown')
  })
  room.on('topic', (topic, oldTopic, changer) => {
    log.info('Bot', 'Room EVENT: topic - changed from "%s" to "%s" by member "%s"',
      oldTopic,
      topic,
      changer.name(),
    )
  })
}

// 检查，只有机器人可以邀请
// 检查哪个群，把哪个群传递进来
async function checkRoomJoin(room, inviteeList, inviter) {
  log.info('Bot', 'checkRoomJoin("%s", "%s", "%s")',
    await room.topic(),
    inviteeList.map(c => c.name()).join(','),
    inviter.name(),
  )

  const userSelf = bot.userSelf()

  if (inviter.id !== userSelf.id) {
    await room.say('只允许私下拉人',
      inviter,
    )
    await room.say('先将你移出群，如有需要，请加我微信',
      inviteeList,
    )
    setTimeout(
      _ => inviteeList.forEach(c => room.del(c)),
      10 * 1000,
    )
  } else {
    await room.say('欢迎~')
  }
}

async function putInRoom(contact, room) {
  try {
    // 这个添加人可能出现错误，例如人数满员了
    await room.add(contact)
    setTimeout(
      _ => room.say('Welcome ', contact),
      10 * 1000,
    )
  } catch (e) {
    log.error('Bot', 'putInRoom() exception: ' + e.stack)
    // 尝试检查群的人数,如果人数满了,建新群重拉
    let members = await room.memberAll()
    if (members.length >= 500) {
      let nextGroupName = getNextGroupName(await room.topic())
      createAndManageRoom(contact, nextGroupName)
    }
  }
}

function getNextGroupName(groupName) {
  let r = groupName
  let res = /\w(\d)?$/i.exec(groupName)
  if (res) {
    let n = parseInt(res[0])
    r = r.replace(`${n}`, n + 1)
  } else {
    r += `${1}`
  }
  return r
}

async function getOutRoom(contact, room) {
  await room.del(contact)
}

function getHelperContact() {
  return bot.Contact.find({ name: data.HELPER_CONTACT_NAME })
}

// 创建一个群
async function createRoom(contact, groupName) {
  // 三个人开始建群
  const helperContact = await getHelperContact()

  if (!helperContact) {
    await contact.say(`没有这个朋友："${helperContact.name()}",或者TA违规了，需要换一个人协助建群`)
    return
  }

  const contactList = [contact, helperContact]
  const room = await bot.Room.create(contactList, groupName)

  // 避免新建的群通过find找不到
  await room.sync()
  await room.topic(groupName)
  await room.say(`${groupName} - created`)

  return room
}

// 获取支付二维码
async function payForGroup(msg, groupName) {
  let outTradeNo = `${new Date().getFullYear()}${short().new()}`
  let trade = {
    out_trade_no: outTradeNo, //
    total_fee: 1, //以分为单位，货币的最小金额
    body: "购买入群券", //最长127字节
    notify_url: `${LOCAL_SERVER}/pay_success_notify`, // 支付成功通知地址
    type: "wechat",
    goods_detail: groupName,
    attach: "",
    nonce_str: wepay.getRandomNumber()
  };
  trade.sign = wepay.getSign(trade)

  let payOrderRes = await axios.post('https://admin.xunhuweb.com/pay/payment', trade)
  log.info("resp", JSON.stringify(payOrderRes.data))
  /**
   数据示例：
   {"mchid":"","return_code":"SUCCESS","nonce_str":"P4Iq9oms6a5BZM6UjREQlgNaSalbGTgI","sign":"8C1902F63F263BB41D2FB3AD6A38AC93","order_id":"d7202b72e10d4601a0e5a5ffc010ab62","out_trade_no":"2021aFFKHadfpVQhRLeRztrUVF",
   "total_fee":1,
   "code_url":"weixin://wxpay/bizpayurl?pr=dhUg6rMzz"}
   */
  // 写文件
  const usersData = util.readFile('./user.json')
  let { out_trade_no, order_id, nonce_str, code_url } = payOrderRes.data
  let userDataObject = {
    out_trade_no,
    order_id,
    nonce_str,
    groupName
  }
  usersData[out_trade_no] = userDataObject
  util.writeFile('./user.json', usersData)

  await msg.say("该群为付费群，扫码支付1分钱将自动拉你进群")
  code_url = encodeURI(code_url)
  // let imageUrl = `${LOCAL_SERVER}/qrcode/${code_url}`//使用本地服务
  let imageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${code_url}`
  log.info("imageUrl", imageUrl)
  // let qrCodeRes = await axios.get(targetUrl)
  // log.info("qrCodeRes",JSON.stringify( qrCodeRes.data))
  const fileBox = FileBox.fromUrl(imageUrl)
  await msg.say(fileBox)

  let payResult = await new Promise((resolve, reject) => {
    // 检查支付订单状态
    const MAX_CHECK_NUM = 60 // 30秒之内支付成功有效
    let checkNum = 0
    const checkPayOrderFunc = async () => {
      let paySuccess = await queryPayOrder(out_trade_no, order_id, nonce_str)
      if (paySuccess) {
        resolve(true)
      } else {
        if (checkNum++ < MAX_CHECK_NUM) {
          setTimeout(checkPayOrderFunc, 3000)
        } else {
          log.info("检查停止，给用户一个主动查询的方法")
          await msg.say(`3分钟内没有检查到支付成功，请稍后向我发送【#查询${out_trade_no}】进行自查询`)
          resolve(false)
        }
      }
    }
    setTimeout(checkPayOrderFunc, 3000)
  })
  return payResult
}

async function queryPayOrder(out_trade_no, order_id, nonce_str) {
  let trade = {
    out_trade_no, 
    order_id, 
    nonce_str 
  };
  trade.sign = wepay.getSign(trade)
  let resp = await axios.post('https://admin.xunhuweb.com/pay/query', trade)
  log.info("queryPayOrder.resp", JSON.stringify(resp.data))
  let success = resp.data.status == 'complete'
  return success
}

// 用户主动检查超时订单的支付状态
async function userQueryOldOrder(msg, userDataObject) {
  let { out_trade_no, order_id, nonce_str, groupName } = userDataObject
  let paySuccess = await queryPayOrder(out_trade_no, order_id, nonce_str)
  if (paySuccess) {
    msg.say("检查到已经支付成功了")
    // 交给正常流程
    dealWithGroup(msg.from(), groupName, msg, false)
  } else {
    msg.say("未检查到支付成功，请检查字符串")
  }
}