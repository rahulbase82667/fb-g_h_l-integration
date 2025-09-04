import nodemailer from 'nodemailer';

export const sendResetEmail = async (email, resetLink) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail', // or use host/port for other providers
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

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

