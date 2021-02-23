const md5Util = require('./md5.js')
const request = require('request')
const xml2js = require('xml2js')

// 在下面设置商户号，密钥
let WEPAY_MCHID = ''
let WEPAY_SECRET = ''

const buildXML = function(json){
	var builder = new xml2js.Builder();
	return builder.buildObject(json);
};

const getRandomNumber = (minNum = 1000000000, maxNum = 99999999999999) => parseInt(Math.random() * (maxNum - minNum + 1) + minNum, 10)

// 检查必须的系统变量
function checkSysVars(){
  if (!WEPAY_MCHID){
    WEPAY_MCHID = process.env.WEPAY_MCHID
    WEPAY_SECRET = process.env.WEPAY_SECRET
  }
}

const getSign = obj => {
  checkSysVars()

  if (!obj.mchid) obj.mchid = WEPAY_MCHID

  let keys = Object.keys(obj)
  keys.sort()
  let params = []

  keys.forEach(e => {
    if (obj[e] != '') {
      params.push(e + '=' + obj[e])
    }
  })

  params.push('key=' + WEPAY_SECRET)

  let paramStr = params.join('&')
  let signResult = md5Util.md5(paramStr).toUpperCase() 

  return signResult
}

const getOrderParams = (trade) => {
  // 支付参数
  let nonce_str = getRandomNumber() // 随机数
  let goods_detail = ''
  let attach = ''

  let paramsObject =  {
    WEPAY_MCHID,
    total_fee: trade.total_fee,
    out_trade_no: trade.out_trade_no,
    body:trade.body,
    goods_detail,
    attach,
    notify_url:trade.notify_url,
    nonce_str
  }
  let sign = getSign(paramsObject)
  paramsObject.sign = sign
  return paramsObject
}

// 退款
const refund = async (order_id)=>{
  let order = {
    WEPAY_MCHID,
    order_id,
    nonce_str:getRandomNumber(),
    refund_desc:'no',
    notify_url:'https://rxyk.cn/apis/pay_notify3',
  }
  order.sign = getSign(order);
  
  // 以json方式提交
  return new Promise((resolve, reject) => {
    request({
      url: "https://admin.xunhuweb.com/pay/refund",
      method: "POST",
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(order),
    }, function(err, res, body){
      console.log(err, res, body)
      if (err) reject(err)
      else resolve(body)
    });
  })
}

module.exports = {
  getOrderParams,
  refund,
  getSign,
  getRandomNumber
}