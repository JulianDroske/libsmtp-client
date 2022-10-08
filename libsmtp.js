/*
	Simple SMTP client implementation for Node.js

	Author: 2022 @ Julian Droske
*/

/*
	220 localhost richmail system v10(2f336340286f714-61c31)
	HELO smtp.139.com
	250 localhost richmail system v10(2f336340286f714-61c31)
	MAIL FROM:<@139.com>
	553 2f336340286f714-61c31 authentication is required
	AUTH LOGIN
	334 dXNlcm5hbWU6
	<username>
	334 UGFzc3dvcmQ6
	<password>
	235 Authentication successful
	RCPT TO:<@qq.com>
	503 Bad sequence of commands
	
	MAIL FROM:<@139.com>
	
	501 Command not implemented
	250 ok
	501 Command not implemented
	RCPT TO:<@qq.com>
	250 ok
	DATA
	354 end with .
	Hello
	World!
	.
	550 2f336340286f714-61ec1 Mail rejected
	DATA
	354 end with .
	From: <@139.com>
	To: <@qq.com>
	Date: Fri, 07 Oct 2022 21:29:42 +0800
	Subject: hello
	
	Hello World!!
	
	.
	550 2f336340286f714-61ec1 Mail rejected
	
*/

module.exports = (()=>{
	const net = require('net');
	const tls = require('tls');
	const fs = require('fs');
	const path = require('path');

	const PRIVATE_KEY_PATH = path.join(__dirname, 'key_private.pem');
	const PUBLIC_KEY_PATH = path.join(__dirname, 'key_public.pem');

	const TEXT_BOUNDARY='=X==text_boundary=';

	// let stdout = process.stdout;

	let log = (...args)=>{
		console.log('<<libsmtp>>', ...args);
	}

	let err = (msg)=>{
		if(!msg.data){
			console.log('<<libsmtp: error>>', msg);
		}
		// stdout.write(`\n<<libsmtp>> ${msg}\n`);
		// stdout.flush();
		throw msg;
	}

	let toBase64 = str=>Buffer.from(str).toString('base64');
	let fromBase64 = str=>Buffer.from(str, 'base64').toString();

	let SEC_OPTS = {
		key: fs.readFileSync(PRIVATE_KEY_PATH),
		cert: fs.readFileSync(PUBLIC_KEY_PATH),
		rejectUnauthorized: false,
	};

	// 220 localhost richmail system v10(2f36633fef51383-58b1e)
	// let assertArgsFromSocket = socket=>{
		// let data = socket.
	// }

	let createLineClient = (client)=>{
		// let lines = [];
		// let lineUpdaterResolvers = [];
		// let waitNewLine = ()=>new Promise((res, rej)=>{
			// lineUpdaterResolvers.push(line=>res(line));
		// });
		// let liner = rl.createInterface(client, client);
		// liner.on('line', line=>{
			// lines.push(line);
			// while(lineUpdaterResolvers.length>0 && lines.length>0){
				// lineUpdaterResolvers.shift()(lines.shift());
			// }
		// });
// 
		// let readLine = (n=1)=>{
			// return new Promise(async (res, rej)=>{
				// let readlines = [];
				// for(let i=0; i<n; ++i){
					// readlines.push(await waitNewLine());
				// }
				// res(readlines);
			// });
		// }
		// let writeLine = (line)=>{
			// liner.write(line+'\n');
		// }

		let lines = [''];
		let buffer = '';
		let resolvers = [];
		client.on('data', dat=>{
			buffer += dat;
			// log('recv', dat.toString());
			if(buffer.indexOf('\n')>=0){
				let buflines = buffer.split('\n').map(v=>v.trim());
				lines[lines.length-1] += buflines.shift();
				lines = lines.concat(buflines);
				while(resolvers.length>0 && lines.length>1){
					resolvers.shift()(lines.shift());
				}
				buffer = '';
			}
		});
		client.on('error', error=>{
			log(error);
			client.destroy();
			// reject();
		});
		client.on('close', ()=>{
			log('connection close');
		});
		let readLine = ()=>{
			if(lines.length>1) return lines.shift();
			return new Promise((res, rej)=>{
				resolvers.push(v=>res(v));
			});
		}
		let writeLine = (line)=>{
			client.write(line+'\r\n');
		}
		
		return {
			readLine,
			writeLine,
		};
	}

	let createSMTPClient = (host, port=25, secure=true)=>{
		let socket = new net.Socket();
		// if(secure) socket = new tls.TLSSocket(socket, SEC_OPTS);

		let sendEmail = ({
			senderName = 'libsmtpSender',
			sender,
			senderPassword,
			receiver,
			subject,
			text,
			attachments
		})=>new Promise(async (resolve,reject)=>{
			try{
				let client = (secure?tls:socket).connect(port, host, SEC_OPTS);
				// if(secure) client = new tls.TLSSocket(client, SEC_OPTS);
				client.setEncoding('utf8');
				let liner = createLineClient(client);

				const acceptables = [250, 235, 354, 220, 334];
				let sendCommand = async (cmd, data, hasReply=true, expectResult)=>{
					if(data) data = data.replace(/([^\r])\n/g, '$1\r\n');
					let cmdline = `${cmd} ${data}`;
					if(!cmd) cmdline = data;
					if(!data) cmdline = cmd;
					// log('send', cmdline);
					liner.writeLine(cmdline);
					if(hasReply){
						let data = (await liner.readLine()).split(' ');
						let code = parseInt(data.shift());
						data = data.join(' ');
						let acceptResults = acceptables;
						if(expectResult!=null) acceptResults = [expectResult];
						if(acceptResults.indexOf(code)<0) throw {code, data};
						return {code, data};
					}
				}

				let sendAttachment = async (filepath)=>{
					let filename = path.basename(filepath);
					filename = `=?UTF-8?B?${toBase64(filename)}?=`;
					let content = fs.readFileSync(filepath).toString('base64');
					await sendCommand(
						null,
`
--${TEXT_BOUNDARY}
Content-Type: octet-stream; name=${filename}
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename=${filename}

${content}
`,
						false
					)
				}

				let sendData = async ()=>{
					await sendCommand('DATA');
					await sendCommand(
						null,
// `From: ${senderName} <${sender}>
// To: <${receiver}>
// Subject: ${subject}
// 
// ${text}
// 
// `,
`From: ${senderName} <${sender}>
To: <${receiver}>
Subject: ${subject}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${TEXT_BOUNDARY}"

--${TEXT_BOUNDARY}
Content-Type: text/plain; charset=UTF-8
Content-Disposition: inline

${text}
`,
						false
					);
					for(let attachment of attachments){
						await sendAttachment(attachment);
					}
					await sendCommand(null, `\n--${TEXT_BOUNDARY}--\n`, false)
					await sendCommand('.');
				}

				let sendInit = async ()=>{
					await liner.readLine();
					await sendCommand('HELO', sender);
				}

				const REQ_USERNAME='username:';
				const REQ_PASSWORD='password:';
				let sendCmdAuth = async ()=>{
					let S = ()=>sendCommand('AUTH', 'LOGIN');
					try{
						let {code, data: req} = await S();
						for(let i=0; i<2&&code==334; ++i){
							let newRet = null;
							if(req==REQ_USERNAME){
								newRet = await sendCommand(null, sender);
							}else if(fromBase64(req).toLowerCase()==REQ_USERNAME){
								newRet = await sendCommand(null, toBase64(sender));
							}else if(req==REQ_PASSWORD){
								newRet = await sendCommand(null, senderPassword);
							}else if(fromBase64(req).toLowerCase()==REQ_PASSWORD){
								newRet = await sendCommand(null, toBase64(senderPassword));
							}else throw `unknown auth: ${req}`;
							({code, data: req} = newRet);
						}
						if(code!=235) throw {code, req};
					}catch(e){
						err(e);
					}
				}

				let sendCmdSender = async ()=>{
					let S = ()=>sendCommand('MAIL', `FROM:<${sender}>`);
					try{
						await S();
					}catch(e){
						if(e.code==553 || e.code==503){
							await sendCmdAuth();
							await S();
						}else throw e;
					}
				}

				let sendCmdReceiver = async ()=>{
					await sendCommand('RCPT', `TO:<${receiver}>`);
				}

				let sendCmdQuit = async ()=>{
					await sendCommand('QUIT', null, true, 221);
					resolve();
				}


				await sendInit();
				await sendCmdSender();
				await sendCmdReceiver();
				await sendData();
				await sendCmdQuit();
				log('program done');
			}catch(e){
				err(e);
			}
		});

		return {
			sendEmail
		};
	};

	return {
		createSMTPClient
	};
})();
