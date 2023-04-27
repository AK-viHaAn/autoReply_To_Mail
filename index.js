const express = require("express");
const app = express();
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]; // scopes for Read and Update
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

// function for loading the Credentials if Already exists
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

// function for saving Credential
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

// Load or request or authorization to call APIs.

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}




// function for auto reply for the received mail

async function autoReply(messageId) {
  try {
    
    const gmail = google.gmail({ version: "v1", auth: await authorize() });     // stores the authentication 
    const message =
      "Thank you for your message. I will look back to your Email.";             // message which i have to send as a reply of new mails
    const messageDetails = await gmail.users.messages.get({
      userId: "me",
      id: messageId,                                                               // get that message which recieved first time 
      format: "metadata",
    });                                                                          
    const headers = messageDetails.data.payload.headers;
    const toHeader = headers.find((header) => header.name === "From");// The message header information is extracted from the messageDetails object
    const recipientEmail = toHeader.value;
    const subjectHeader = headers.find((header) => header.name === "Subject");
    const subject = subjectHeader ? `Re: ${subjectHeader.value}` : "No subject";

    const replyMessageParts = [
      `Content-Type: text/plain; charset=utf-8`,
      `From: agvihaan3867@gmail.com`,
      `To: ${recipientEmail}`,                                 //    message components to construct the auto-reply message.
      `Subject: ${subject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      ``,
      `On ${new Date().toLocaleString()}, ${toHeader.value} wrote:`,
      ``,
      `> ${messageDetails.data.snippet}`,
      ``,
      message,                                                   // message which i have to send
    ];

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: Buffer.from(replyMessageParts.join("\n")).toString("base64"),//it contains the raw message part joined as a str and encoded as base64.
      },
    });

    console.log("Response sent:", res.data);                           // send response
  } catch (error) {
    console.error(error);                                                // catches internal server if any
  }
}












// function for getting all the unread messages from inbox whose category is Primary

async function getAllUnreadEmail() {
  try {
    console.log("function start");                                       // for alerting that function is starting
    const gmail = google.gmail({ version: "v1", auth: await authorize() });

    const currentTime = new Date().getTime();
    const oneMinuteAgo = Math.floor((currentTime - 20000) / 1000);       // for declaring the time for which this function will fetch new emails  that is 20 seconds
    const res = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread in:inbox category:primary after:" + oneMinuteAgo,
      maxResults: 100,
    });                                                              // it will give the whole data of first 100 mails as per the condition applied

    let listOfUnreadMail = res.data.messages;                       // filter out the nessasry data which we need
    // console.log(listOfUnreadMail);

    if (!listOfUnreadMail) {
      console.log("No unread messages found.");
      return;
    }                                                               // if no message recieved within 20 seconds of running the server

    for (let i = 0; i < listOfUnreadMail.length; i++) {
      const message = await gmail.users.messages.get({
        userId: "me",
        id: res.data.messages[i].id,
        format: "metadata",

        metadataHeaders: ["References", "In-Reply-To"],
      });                                                          // ittrate over all the list and find out the metadata that is main content/mail
      //   console.log(message.data);
      const threadId = message.data.threadId;

      const threadsResponse = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "metadata",
        metadataHeaders: ["References", "In-Reply-To"],
      });                                                         // filter out the metadata on the basis of threadId 
      //   console.log("threadsResponse", threadsResponse);
      if (!threadsResponse.data.messages) {
        console.log("No unread messages found.");
        continue;
      }
      if (threadsResponse.data.messages.length == 1) {              //  checking whether that particular mail received first time or not if yes then it will go inside
        const messageId = threadsResponse.data.messages[0].id;      // stores the particular data in a variable
        console.log("Message ID:", messageId);
        await autoReply(messageId);                                 // calls a function which will send a reply to that particular mail whose data is stored in messageId
        return;                                                     
      }
    }
  } catch (error) {
    console.error(error);                                        // catches the internal server error if any 
  }
}

setInterval(getAllUnreadEmail, 10000);      // calling the main function under set interval so that in every 10 second the function will run again
