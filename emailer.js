const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL,
    pass: process.env.ALERT_PASS
  }
});

function sendEmail(subject, body) {
  const mailOptions = {
    from: process.env.ALERT_EMAIL,
    to: process.env.ALERT_TO,
    subject,
    text: body
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('❌ Email failed:', err.message);
    } else {
      console.log('📧 Email sent:', info.response);
    }
  });
}

module.exports = sendEmail;
