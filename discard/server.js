const Koa = require('koa');
const app = new Koa();
const Router = require('koa-router')
const bodyParser = require('koa-bodyparser')
const qrimage = require('qr-image')
const getRawBody = require('raw-body')

app.use(bodyParser())

let home = new Router()
home.get('/', async (ctx) => {
  ctx.body = 'hi'
})
home.get("/qrcode/:codeurl", ctx => {
  let codeurl = decodeURIComponent(ctx.params.codeurl)
  let img = qrimage.image(codeurl, { size: 10 })
  ctx.type = 'image/png'
  ctx.body = img
})
home.all("/pay_success_notify", async ctx => {
  var rawText = await getRawBody(ctx.req, {
    encoding: 'utf-8'
  });
  var retobj = JSON.parse(rawText)// await wepay.notifyParse(rawText);
  console.log("payNotify parsed:", retobj)
})
// 加载路由中间件
app.use(home.routes()).use(home.allowedMethods())

app.use(async ctx => {
  ctx.body = 'Hello World';
});

app.listen(3000);