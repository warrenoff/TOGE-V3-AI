require('./config')
const pino = require('pino')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const moment = require('moment-timezone');
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const Config = require("./Config")
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/lib/myfunc.js')
const { default: MariaConnect, delay, PHONENUMBER_MCC, makeCacheableSignalKeyStore, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, generateForwardMessageContent, prepareWAMessageMedia, generateWAMessageFromContent, generateMessageID, downloadContentFromMessage, makeInMemoryStore,getAggregateVotesInPollMessage, jidDecode, proto, Browsers } = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const Pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")

const prefix = global.prefa || "." 

const makeWASocket = 
require("@whiskeysockets/baileys").default

const store = makeInMemoryStore({
    logger: pino().child({
        level: 'silent',
        stream: 'store'
    })
})

let phoneNumber = "24102150169"
let owner = JSON.parse(fs.readFileSync('./lib/database/owner.json'))

const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))
         
async function startMaria() {
//------------------------------------------------------
let { version, isLatest } = await fetchLatestBaileysVersion()
const {  state, saveCreds } =await useMultiFileAuthState(`./session`)
    const msgRetryCounterCache = new NodeCache() // for retry message, "waiting message"
    const Maria = makeWASocket({
      logger: pino({ level: 'silent' }),
      printQRInTerminal: !pairingCode, // popping up QR in terminal log
      mobile: useMobile, // mobile api (prone to bans)
      browser: Browsers.ubuntu('Chrome'), // for this issues https://github.com/WhiskeySockets/Baileys/issues/328
      auth: state,
      markOnlineOnConnect: true, // set false for offline
      generateHighQualityLinkPreview: true, // make high preview link
      getMessage: async (key) => {
         let jid = jidNormalizedUser(key.remoteJid)
         let msg = await store.loadMessage(jid, key.id)

         return msg?.message || ""
      },
      msgRetryCounterCache, // Resolve waiting messages
      defaultQueryTimeoutMs: undefined, // for this issues https://github.com/WhiskeySockets/Baileys/issues/276
   })
   
   store.bind(Maria.ev)

    // login use pairing code
   // source code https://github.com/WhiskeySockets/Baileys/blob/master/Example/example.ts#L61
   if (pairingCode && !Maria.authState.creds.registered) {
      if (useMobile) throw new Error('Cannot use pairing code with mobile api')

      let phoneNumber
      if (!!phoneNumber) {
         phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

         if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) {
            console.log(chalk.bgBlack(chalk.redBright("Start with country code of your WhatsApp Number, Example : +919931122319")))
            process.exit(0)
         }
      } else {
         phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Your WhatsApp bot number\nFor example: +919931122319 : `)))
         phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

         // Ask again when entering the wrong number
         if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) {
            console.log(chalk.bgBlack(chalk.redBright("Start with country code of your WhatsApp Number, Example : +919931122319")))

            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Your WhatsApp bot number please\nFor example: +919931122319: `)))
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
            rl.close()
         }
      }

      setTimeout(async () => {
         let code = await Maria.requestPairingCode(phoneNumber)
         code = code?.match(/.{1,4}/g)?.join("-") || code
         console.log(chalk.black(chalk.bgGreen(`🤖Your Pairing Code🤖: `)), chalk.black(chalk.white(code)))
      }, 3000)
   }
	Maria.ev.on('contacts.update', (update) => {
		for (let contact of update) {
			let id = Maria.decodeJid(contact.id)
			if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
		}
	});
    Maria.ev.on('messages.upsert', async chatUpdate => {
        //console.log(JSON.stringify(chatUpdate, undefined, 2))
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast'){
            if (autoread_status) {
            await Maria.readMessages([mek.key]) 
            }
            } 
            if (!Maria.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
            const m = smsg(Maria, mek, store)
            require("./TOGE-V3")(Maria, m, chatUpdate, store)
        } catch (err) {
            console.log(err)
        }
    })

   Maria.sendContact = async (jid, kon, quoted = '', opts = {}) => {
	let list = []
	for (let i of kon) {
	    list.push({
	    	displayName: await Maria.getName(i + '@s.whatsapp.net'),
	    	vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${await Maria.getName(i + '@s.whatsapp.net')}\nFN:${await Maria.getName(i + '@s.whatsapp.net')}\nitem1.TEL;waid=${i}:${i}\nitem1.X-ABLabel:owner number\nitem2.EMAIL;type=INTERNET:togeoff2@gmail.com\nitem2.X-ABLabel:Email\nitem3.URL:https://instagram.com/lawliet.kfx\nitem3.X-ABLabel:Instagram\nitem4.ADR:;;Africa, Gabon, Libreville;;;;\nitem4.X-ABLabel:Region\nEND:VCARD`
	    })
	}
	Maria.sendMessage(jid, { contacts: { displayName: global.ownername, contacts: list }, ...opts }, { quoted })
    }
    
    Maria.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    Maria.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = Maria.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = {
                id,
                name: contact.notify
            }
        }
    })

    Maria.getName = (jid, withoutContact = false) => {
        id = Maria.decodeJid(jid)
        withoutContact = Maria.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = Maria.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
                id,
                name: 'WhatsApp'
            } : id === Maria.decodeJid(Maria.user.id) ?
            Maria.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }
    
    Maria.public = true

    Maria.serializeM = (m) => smsg(Maria, m, store)

Maria.ev.on("connection.update",async  (s) => {
        const { connection, lastDisconnect } = s
        if (connection == "open") {
console.log(chalk.green('🟨Welcome to Maria-md'));
console.log(chalk.gray('\n\n🚀Initializing...'));
           await delay(1000 * 2) 
            
            
console.log(chalk.cyan('\n\n🥵Connected'));

Maria.sendMessage(Maria.user.id, {
    text: `𝚃𝙾𝙶𝙴-𝙼𝙳-𝚅𝟹 ᴄᴏɴɴᴇᴄᴛᴇᴅ 

ᴘʀᴇꜰɪx: [ ${prefix} ]\n
ᴄᴏᴍᴍᴀɴᴅꜱ: 248\n
ᴠᴇʀꜱɪᴏɴ: 3.0\n
ᴄʀᴇᴀᴛᴏʀ: ᴛᴏɢᴇ ɪɴᴜᴍᴀᴋɪ\n
_ᴛʏᴘᴇ ${prefix}ᴀʟɪᴠᴇ ᴛᴏ ᴜꜱᴇ ᴛʜᴇ ʙᴏᴛ_ 🤖`
});


const rainbowColors = ['red', 'yellow', 'green', 'blue', 'purple'];
let index = 0;

function printRainbowMessage() {
  const color = rainbowColors[index];
  console.log(chalk.keyword(color)('\n\nwaiting for messages'));
  index = (index + 1) % rainbowColors.length;
  setTimeout(printRainbowMessage, 60000);  // Adjust the timeout for desired speed
}

printRainbowMessage();
}
    
        
                if (
            connection === "close" &&
            lastDisconnect &&
            lastDisconnect.error &&
            lastDisconnect.error.output.statusCode != 401
        ) {
            startMaria()
        }
    })
    Maria.ev.on('creds.update', saveCreds)
    Maria.ev.on("messages.upsert",  () => { })

    Maria.sendText = (jid, text, quoted = '', options) => Maria.sendMessage(jid, {
        text: text,
        ...options
    }, {
        quoted,
        ...options
    })
    Maria.sendTextWithMentions = async (jid, text, quoted, options = {}) => Maria.sendMessage(jid, {
        text: text,
        mentions: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net'),
        ...options
    }, {
        quoted
    })
    
     async function appenTextMessage(text, chatUpdate) {
        let messages = await generateWAMessage(m?.chat, { text: text, mentions: m?.mentionedJid }, {
            userJid: Maria.user.id,
            quoted:m?.quoted && m?.quoted.fakeObj
        })
        messages.key.fromMe = areJidsSameUser(m?.sender, Maria.user.id)
        messages.key.id = m?.key.id
        messages.pushName = m?.pushName
        if (m?.isGroup) messages.participant = m?.sender
        let msg = {
            ...chatUpdate,
            messages: [proto.WebMessageInfo.fromObject(messages)],
            type: 'append'}
Maria.ev.emit('messages.upsert', msg)}       

    Maria.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,` [1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifImg(buff, options)
        } else {
            buffer = await imageToWebp(buff)
        }

        await Maria.sendMessage(jid, {
            sticker: {
                url: buffer
            },
            ...options
        }, {
            quoted
        })
        return buffer
    }
    Maria.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,` [1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifVid(buff, options)
        } else {
            buffer = await videoToWebp(buff)
        }

        await Maria.sendMessage(jid, {
            sticker: {
                url: buffer
            },
            ...options
        }, {
            quoted
        })
        return buffer
    }
    Maria.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
        let quoted = message.msg ? message.msg : message
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(quoted, messageType)
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        let type = await FileType.fromBuffer(buffer)
        trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
        // save to file
        await fs.writeFileSync(trueFileName, buffer)
        return trueFileName
    }
    //////
async function getMessage(key){
        if (store) {
            const msg = await store.loadMessage(key.remoteJid, key.id)
            return msg?.message
        }
        return {
            conversation: "TOGE-MD-V3 Here!"
        }
    }
    Maria.ev.on('messages.update', async chatUpdate => {
        for(const { key, update } of chatUpdate) {
			if(update.pollUpdates && key.fromMe) {
				const pollCreation = await getMessage(key)
				if(pollCreation) {
				    const pollUpdate = await getAggregateVotesInPollMessage({
							message: pollCreation,
							pollUpdates: update.pollUpdates,
						})
	                var toCmd = pollUpdate.filter(v => v.voters.length !== 0)[0]?.name
	                if (toCmd == undefined) return
                    var prefCmd = xprefix+toCmd
	                Maria.appenTextMessage(prefCmd, chatUpdate)
				}
			}
		}
    })



Maria.sendPoll = (jid, name = '', values = [], selectableCount = 1) => {
    return Maria.sendMessage(jid, { poll: { name, values, selectableCount } });
}
//welcome
Maria.ev.on('group-participants.update', async (anu) => {
    	if (global.welcome){
console.log(anu)
try {
let metadata = await Maria.groupMetadata(anu.id)
let participants = anu.participants
for (let num of participants) {
try {
ppuser = await Maria.profilePictureUrl(num, 'image')
} catch (err) {
ppuser = 'https://telegra.ph/file/84c72f254095f1cb7748f.jpg'
}
try {
ppgroup = await Maria.profilePictureUrl(anu.id, 'image')
} catch (err) {
ppgroup = 'https://i.ibb.co/RBx5SQC/avatar-group-large-v2.png?q=60'
}
	
memb = metadata.participants.length
MariaWlcm = await getBuffer('https://telegra.ph/file/84c72f254095f1cb7748f.jpg')
MariaLft = await getBuffer('https://telegra.ph/file/5236c4d25117ec5a7a9ad.jpg')
                if (anu.action == 'add') {
                const Mariabuffer = await getBuffer(ppuser)
                let MariaName = num
                const xtime = moment.tz('Asia/Kolkata').format('HH:mm:ss')
	            const xdate = moment.tz('Asia/Kolkata').format('DD/MM/YYYY')
	            const xmembers = metadata.participants.length
Mariabody = `│「 𝗛𝗶 👋 」
└┬❖ 「  @${MariaName.split("@")[0]}  」
   │✑  𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 
   │✑  ${metadata.subject}
   │✑  𝗠𝗲𝗺𝗯𝗲𝗿 : 
   │✑ ${Mariamembers}th
   │✑  𝗝𝗼𝗶𝗻𝗲𝗱 : 
   │✑ ${Mariatime} ${Mariadate}
   └───────────────┈ ⳹`

let msgs = generateWAMessageFromContent(anu.id, {
  viewOnceMessage: {
    message: {
        "messageContextInfo": {
          "deviceListMetadata": {},
          "deviceListMetadataVersion": 2
        },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({
            text: Mariabody
          }),
          footer: proto.Message.InteractiveMessage.Footer.create({
            text: botname
          }),
          header: proto.Message.InteractiveMessage.Header.create({
          hasMediaAttachment: false,
          ...await prepareWAMessageMedia({ image: MariaWlcm }, { upload: Maria.waUploadToServer })
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [{
            "name": "quick_reply",
              "buttonParamsJson": `{"display_text":"𝗦𝗖𝗥𝗜𝗣𝗧","id":"${prefix}sc"}`
            },
            {
            "name": "quick_reply",
              "buttonParamsJson": `{"display_text":"𝗚𝗥𝗢𝗨𝗣 𝗗𝗘𝗦𝗖","id":"${prefix}description"}`
            }
],
          }),
          contextInfo: {
                  mentionedJid: [num], 
                  forwardingScore: 999,
                  isForwarded: true,
                forwardedNewsletterMessageInfo: {
                  newsletterJid: '120363213318329067@newsletter',
                  newsletterName: ownername,
                  serverMessageId: 143
                }
                }
       })
    }
  }
}, {})
Maria.relayMessage(anu.id, msgs.message, {})
                } else if (anu.action == 'remove') {
                	const Mariabuffer = await getBuffer(ppuser)
                    const Mariatime = moment.tz('Asia/Kolkata').format('HH:mm:ss')
	                const Mariadate = moment.tz('Asia/Kolkata').format('DD/MM/YYYY')
                	let MariaName = num
                    const Mariamembers = metadata.participants.length  
     Mariabody = `┌─❖
│「 𝗚𝗼𝗼𝗱𝗯𝘆𝗲 👋 」
└┬❖ 「  @${MariaName.split("@")[0]}  」
   │✑  𝗟𝗲𝗳𝘁 
   │✑  ${metadata.subject}
   │✑  𝗠𝗲𝗺𝗯𝗲𝗿 : 
   │✑ ${Mariamembers}th
   │✑  𝗧𝗶𝗺𝗲 : 
   │✑ ${Mariatime} ${Mariadate}
   └───────────────┈ ⳹`
let msgs = generateWAMessageFromContent(anu.id, {
  viewOnceMessage: {
    message: {
        "messageContextInfo": {
          "deviceListMetadata": {},
          "deviceListMetadataVersion": 2
        },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({
            text: Mariabody
          }),
          footer: proto.Message.InteractiveMessage.Footer.create({
            text: botname
          }),
          header: proto.Message.InteractiveMessage.Header.create({
          hasMediaAttachment: false,
          ...await prepareWAMessageMedia({ image: MariaLft }, { upload: Maria.waUploadToServer })
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [{
            "name": "quick_reply",
              "buttonParamsJson": `{"display_text":"𝗦𝗖𝗥𝗜𝗣𝗧","id":"${prefix}sc"}`
            },
            {
            "name": "quick_reply",
              "buttonParamsJson": `{"display_text":"𝗠𝗘𝗡𝗨","id":"${prefix}menu"}`
            }
],
          }),
         
          contextInfo: {
                  mentionedJid: [num], 
                  forwardingScore: 999,
                  isForwarded: true,
                forwardedNewsletterMessageInfo: {
                  newsletterJid: '120363213314829067@newsletter',
                  newsletterName: ownername,
                  serverMessageId: 143
                }
                }
       })
    }
  }
}, {})
Maria.relayMessage(anu.id, msgs.message, {})
}
}
} catch (err) {
console.log(err)
}
}
})
    Maria.downloadMediaMessage = async (message) => {
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(message, messageType)
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }

        return buffer
    }
    }
return startMaria()

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})

process.on('uncaughtException', function (err) {
let e = String(err)
if (e.includes("Socket connection timeout")) return
if (e.includes("item-not-found")) return
if (e.includes("rate-overlimit")) return
if (e.includes("Connection Closed")) return
if (e.includes("Timed Out")) return
if (e.includes("Value not found")) return
console.log('Caught exception: ', err)
})
