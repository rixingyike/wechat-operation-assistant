[![Powered by Wechaty](https://img.shields.io/badge/Powered%20By-Wechaty-brightgreen.svg)](https://wechaty.js.org)

# wechat-operation-assistant
一个使用小微商户+微信聊天机器人构建的私域运营助手

这是一个实验性的小项目，希望能给你启发。不提供任何保证和许诺。

该项目基于微信小微商户+Wechaty实现，并借鉴于Wechaty的示例代码（https://github.com/wechaty/wechaty-getting-started）。

## 主要功能

主要支持的交互指令：

1. 申请加入xx群，可以加入群，将xx换成具体的关键字，例如书法
2. #查询2021xxx，用于查询旧订单，如果支付了可以补拉进群
3. 指定的管理员，可以使用”@xxx 勿发“这样的群消息指令，让机器人踢出某人

## 使用准备

在使用之前需要Wechaty的token和小微商户的MCHID和SECRET。前者可在 https://qiwei.juzibot.com/corpPremium/wechaty 购买，是月租付费形式，更稿时每月200。后者在 https://pay.xunhuweb.com/ 申请，一次性付费。

拿到启动材料后，需要在本地bash中配置一下系统变量：

```
export WEPAY_MCHID=xxx
export WEPAY_SECRET=xxx
export WECHATY_PUPPET_HOSTIE_TOKEN=xxx
```

## 如何启动

```
git clone https://github.com/rixingyike/wechat-operation-assistant.git --depth=1
cd wechat-operation-assistant
npm i
npm run serve
```

有问题请关注微信公众号“程序员LIYI”联系作者。

![](https://yishulun.com/post-images/1610260345230.jpg)

## 版本

v1.0：https://github.com/rixingyike/wechat-operation-assistant/releases/tag/v1.0

作者为这个版本的使用录了一个视频：https://mp.weixin.qq.com/s/TUKmK7IgJElECt7hNq5QEA