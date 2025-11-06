import nodemailer from 'nodemailer';
import { getFacebookAccountById } from '../models/FacebookAccount.js';
const transporter = nodemailer.createTransport({
  service: 'gmail', // or use host/port for other providers
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
export const sendResetEmail = async (email, resetLink) => {


  const mailOptions = {
    from: `"Your App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset your password',
    html: `
      <p>You requested a password reset.</p>
      <p>Click the link below to reset your password (valid for 15 mins):</p>
      <a href="${resetLink}">${resetLink}</a>
    `
  };
  await transporter.sendMail(mailOptions);
};


export const sendFaiiledMessageMail = async (email, accountId,chatPartner) => {
  const account=await getFacebookAccountById(accountId);
  if(!account)return false;
  const mailOptions = {
    from: `"Your App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Failed to send message',
    html: `
      <p>Failed to send message on fb account id: <b>${accountId}</b> ON OUR PLATFORM</p>
      <p>Facebook Account: <b>${account.email|| account.phone} </b></p>
      <p>Facebook Account Name: <b>${account.name} </b></p>
      <p>Chat partner: <b>${chatPartner}</b></p>
      <p>Error: <b>${account.last_error||""}</p>
    `
  };
  try {
   return  await transporter.sendMail(mailOptions);
  } catch (error) {
    console.log(error);
  }
}
