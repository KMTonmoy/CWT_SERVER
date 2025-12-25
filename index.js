const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const nodemailer = require("nodemailer");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 5000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    mimetype ? cb(null, true) : cb(new Error('Only image files allowed'));
  }
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Email configuration error:', error.message);
    console.log('👉 Check your .env file and ensure:');
    console.log('   1. EMAIL_USER is your Gmail address');
    console.log('   2. EMAIL_PASSWORD is your 16-char app password (no spaces)');
    console.log('   3. 2-Step Verification is enabled on your Google account');
  } else {
    console.log('✅ Email server ready to send messages');
  }
});

const emailVerifications = new Map();
const COOLDOWN_HOURS = 24;
const MAX_ATTEMPTS = 4;

// const createVerificationEmail = (code, userName, email) => {
//   return `
//     <!DOCTYPE html>
//     <html>
//     <head>
//         <meta charset="utf-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//             * { margin: 0; padding: 0; box-sizing: border-box; }
//             body { font-family: -apple-system, sans-serif; line-height: 1.6; color: #333; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
//             .container { max-width: 600px; margin: 0 auto; }
//             .header { background: white; padding: 30px; text-align: center; border-radius: 15px 15px 0 0; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
//             .logo { font-size: 28px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; }
//             .content { background: white; padding: 40px; border-radius: 0 0 15px 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
//             .greeting { font-size: 24px; margin-bottom: 20px; color: #2d3748; }
//             .code-container { background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%); border-radius: 10px; padding: 30px; text-align: center; margin: 30px 0; border: 2px dashed #667eea; }
//             .code { font-size: 48px; font-weight: bold; letter-spacing: 10px; color: #667eea; font-family: 'Courier New', monospace; }
//             .instruction { color: #4a5568; margin-bottom: 15px; font-size: 16px; }
//             .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 30px 0; border-radius: 5px; }
//             .warning-title { color: #856404; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; }
//             .warning-list { color: #856404; padding-left: 20px; }
//             .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 14px; }
//             .attempts-info { display: inline-block; background: #e53e3e; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; margin-top: 10px; }
//             @media (max-width: 600px) { .content { padding: 20px; } .code { font-size: 32px; letter-spacing: 5px; } .greeting { font-size: 20px; } }
//         </style>
//     </head>
//     <body>
//         <div class="container">
//             <div class="header"><div class="logo">CWT</div><h1>Email Verification</h1></div>
//             <div class="content">
//                 <h2 class="greeting">Hello ${userName || 'Valued User'},</h2>
//                 <p class="instruction">Your verification code is:</p>
//                 <div class="code-container"><div class="code">${code}</div></div>
//                 <p class="instruction">Enter this code on the verification page within <strong>10 minutes</strong>.</p>
//                 <p class="instruction"><strong>${email}</strong></p>
//                 <div class="warning-box">
//                     <div class="warning-title">Important Security Information</div>
//                     <ul class="warning-list">
//                         <li>Code expires in 10 minutes</li>
//                         <li>You have 4 attempts</li>
//                         <li>After 4 failed attempts: 24-hour block</li>
//                         <li>Never share this code</li>
//                     </ul>
//                 </div>
//                 <div class="footer">
//                     <p>Best regards,<br><strong>The CWT Team</strong></p>
//                     <div class="attempts-info">Security: ${MAX_ATTEMPTS} attempts max</div>
//                 </div>
//             </div>
//         </div>
//     </body>
//     </html>
//   `;
// };



const createVerificationEmail = (code, userName, email) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CWT - Email Verification</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', 'Inter', -apple-system, system-ui, sans-serif; line-height: 1.6; color: #1a202c; background: linear-gradient(135deg, #f6f9fc 0%, #f1f5f9 100%); min-height: 100vh; padding: 40px 20px; }
            .container { max-width: 640px; margin: 0 auto; }
            .email-wrapper { background: white; border-radius: 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.1); overflow: hidden; }
            .header { background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 48px 40px; text-align: center; color: white; position: relative; }
            .header::after { content: ''; position: absolute; bottom: -50px; left: 0; right: 0; height: 100px; background: white; border-radius: 50% 50% 0 0; }
            .logo { font-size: 36px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px; display: inline-block; background: white; padding: 12px 28px; border-radius: 16px; color: #2563eb; box-shadow: 0 10px 30px rgba(37, 99, 235, 0.15); }
            .header-title { font-size: 28px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.2px; }
            .header-subtitle { font-size: 16px; opacity: 0.9; font-weight: 400; }
            .shield-icon { width: 80px; height: 80px; background: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 32px; font-size: 40px; }
            .content { padding: 72px 48px 48px; position: relative; z-index: 1; }
            .greeting { font-size: 24px; font-weight: 600; margin-bottom: 24px; color: #1e293b; }
            .user-highlight { color: #2563eb; font-weight: 700; }
            .message { color: #475569; margin-bottom: 32px; font-size: 16px; line-height: 1.8; }
            .code-section { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 20px; padding: 40px; text-align: center; margin: 40px 0; border: 1px solid #e2e8f0; }
            .code-label { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 16px; }
            .code { font-size: 56px; font-weight: 800; letter-spacing: 8px; color: #2563eb; font-family: 'SF Mono', 'Roboto Mono', monospace; margin: 0; text-shadow: 0 2px 4px rgba(37, 99, 235, 0.1); }
            .timer { font-size: 14px; color: #ef4444; font-weight: 600; margin-top: 12px; }
            .email-display { background: #f8fafc; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center; border: 1px dashed #cbd5e1; }
            .email-text { font-family: 'SF Mono', monospace; font-size: 18px; color: #334155; font-weight: 500; }
            .security-section { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 6px solid #f59e0b; border-radius: 16px; padding: 32px; margin: 40px 0; }
            .security-title { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
            .security-icon { color: #d97706; font-size: 24px; }
            .security-heading { font-size: 20px; font-weight: 700; color: #92400e; }
            .security-list { list-style: none; padding: 0; }
            .security-item { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; color: #92400e; }
            .bullet { color: #f59e0b; font-size: 20px; line-height: 1; }
            .action-button { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: white; text-decoration: none; padding: 18px 40px; border-radius: 14px; font-weight: 700; font-size: 18px; margin: 32px 0; box-shadow: 0 10px 25px rgba(37, 99, 235, 0.3); transition: transform 0.2s, box-shadow 0.2s; }
            .action-button:hover { transform: translateY(-2px); box-shadow: 0 15px 35px rgba(37, 99, 235, 0.4); }
            .instructions { background: #f0f9ff; border-radius: 16px; padding: 28px; margin: 32px 0; border: 1px solid #bae6fd; }
            .instructions-title { font-size: 18px; font-weight: 700; color: #0369a1; margin-bottom: 16px; }
            .instructions-list { color: #0c4a6e; }
            .footer { text-align: center; padding: 48px 40px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
            .footer-logo { font-size: 24px; font-weight: 800; color: #2563eb; margin-bottom: 16px; }
            .footer-text { color: #64748b; font-size: 14px; line-height: 1.6; margin-bottom: 24px; max-width: 400px; margin-left: auto; margin-right: auto; }
            .contact-info { color: #475569; font-size: 14px; margin: 16px 0; }
            .copyright { color: #94a3b8; font-size: 12px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0; }
            .badge { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #34d399 100%); color: white; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; margin-top: 16px; }
            @media (max-width: 640px) { 
                .content { padding: 56px 24px 32px; }
                .header { padding: 40px 24px; }
                .code { font-size: 40px; letter-spacing: 6px; }
                .code-section { padding: 32px 24px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="email-wrapper">
                <div class="header">
                    <div class="shield-icon">🔒</div>
                    <div class="logo">CWT</div>
                    <h1 class="header-title">Secure Email Verification</h1>
                    <p class="header-subtitle">Protecting Your Account Security</p>
                </div>
                
                <div class="content">
                    <h2 class="greeting">Hello <span class="user-highlight">${userName || 'Valued Member'}</span>,</h2>
                    
                    <p class="message">
                        Thank you for choosing CWT. To ensure the security of your account and complete your registration process, 
                        please verify your email address using the verification code below. This step helps us maintain a secure 
                        environment for all our users.
                    </p>
                    
                    <div class="code-section">
                        <div class="code-label">Your Verification Code</div>
                        <div class="code">${code}</div>
                        <div class="timer">⏰ Expires in 10 minutes</div>
                    </div>
                    
                    <div class="email-display">
                        <div class="code-label">Verifying Email Address</div>
                        <div class="email-text">${email}</div>
                    </div>
                    
                    <div class="instructions">
                        <h3 class="instructions-title">How to Complete Verification:</h3>
                        <ul class="instructions-list">
                            <li>Return to your CWT account dashboard</li>
                            <li>Navigate to the email verification section</li>
                            <li>Enter the 6-digit code shown above</li>
                            <li>Click "Verify Email" to complete the process</li>
                        </ul>
                    </div>
                    
                    <div class="security-section">
                        <div class="security-title">
                            <span class="security-icon">⚠️</span>
                            <h3 class="security-heading">Security Advisory</h3>
                        </div>
                        <ul class="security-list">
                            <li class="security-item">
                                <span class="bullet">•</span>
                                <span><strong>Confidential Information:</strong> This verification code is intended for your use only. Do not share it with anyone, including CWT representatives.</span>
                            </li>
                            <li class="security-item">
                                <span class="bullet">•</span>
                                <span><strong>Attempt Limitations:</strong> You have ${MAX_ATTEMPTS} attempts to enter the correct code. After ${MAX_ATTEMPTS} failed attempts, further verification requests will be temporarily disabled for 24 hours.</span>
                            </li>
                            <li class="security-item">
                                <span class="bullet">•</span>
                                <span><strong>Time Sensitivity:</strong> For security reasons, this code will expire automatically in 10 minutes.</span>
                            </li>
                            <li class="security-item">
                                <span class="bullet">•</span>
                                <span><strong>Unauthorized Request:</strong> If you did not initiate this verification request, please ignore this email and contact our security team immediately.</span>
                            </li>
                        </ul>
                    </div>
                    
                    <div style="text-align: center;">
                        <div class="badge">Secure & Encrypted</div>
                    </div>
                </div>
                
                <div class="footer">
                    <div class="footer-logo">CWT</div>
                    <p class="footer-text">
                        CWT is committed to providing a secure and reliable platform for all users. 
                        We implement industry-standard security measures to protect your information.
                    </p>
                    <div class="contact-info">
                        <strong>Need Assistance?</strong><br>
                        Visit our <a href="#" style="color: #2563eb; text-decoration: none;">Help Center</a> or 
                        <a href="#" style="color: #2563eb; text-decoration: none;">Contact Support</a>
                    </div>
                    <div class="copyright">
                        © ${new Date().getFullYear()} CWT. All rights reserved.<br>
                        This is an automated message. Please do not reply to this email.<br>
                        CWT Headquarters | Secure Communication
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
};



app.use(cors({ origin: ["http://localhost:3000"], credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const uri = process.env.DB_URI;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const usersCollection = client.db("CWT").collection("users");

    app.get("/", (req, res) => {
      res.json({ success: true, message: "CWT Backend API", timestamp: new Date().toISOString() });
    });

 

    app.get("/api/health", (req, res) => {
      res.json({ success: true, message: "CWT Backend running", timestamp: new Date().toISOString() });
    });

    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json({ success: true, count: users.length, users });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch users" });
      }
    });

    app.get("/api/users/email/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        user ? res.json({ success: true, user }) : res.status(404).json({ success: false, message: "User not found" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch user" });
      }
    });

    app.get("/api/users/uid/:uid", async (req, res) => {
      try {
        const uid = req.params.uid;
        const user = await usersCollection.findOne({ uid });
        user ? res.json({ success: true, user }) : res.status(404).json({ success: false, message: "User not found" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch user" });
      }
    });

    app.get("/api/users/id/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid user ID" });
        const user = await usersCollection.findOne({ _id: new ObjectId(id) });
        user ? res.json({ success: true, user }) : res.status(404).json({ success: false, message: "User not found" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch user" });
      }
    });

    app.post("/api/users/register", async (req, res) => {
      try {
        const userData = req.body;
        if (!userData.email || !userData.name || !userData.uid) {
          return res.status(400).json({ success: false, message: "Email, name, and UID required" });
        }
        const existingUser = await usersCollection.findOne({ $or: [{ email: userData.email }, { uid: userData.uid }] });
        if (existingUser) return res.json({ success: true, message: "User exists", user: existingUser });
        
        const completeUserData = {
          uid: userData.uid,
          email: userData.email,
          name: userData.name,
          phone: userData.phone || "",
          birthDate: userData.birthDate || null,
          address: userData.address || "",
          postCode: userData.postCode || "",
          city: userData.city || "",
          role: userData.role || "student",
          photoURL: userData.photoURL || "",
          status: userData.status || "active",
          displayName: userData.displayName || userData.name,
          bio: userData.bio || "",
          education: userData.education || "",
          occupation: userData.occupation || "",
          socialLinks: userData.socialLinks || { facebook: "", twitter: "", linkedin: "", github: "", portfolio: "" },
          notifications: userData.notifications || { email: true, sms: false, push: true },
          emailVerified: userData.emailVerified || false,
          phoneVerified: userData.phoneVerified || false,
          lastLogin: userData.lastLogin || new Date().toISOString(),
          lastActive: userData.lastActive || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const result = await usersCollection.insertOne(completeUserData);
        const insertedUser = await usersCollection.findOne({ _id: result.insertedId });
        res.status(201).json({ success: true, message: "User registered", user: insertedUser });
      } catch (error) {
        res.status(500).json({ success: false, message: "Registration failed" });
      }
    });

    app.patch("/api/users/uid/:uid", async (req, res) => {
      try {
        const { uid } = req.params;
        const updateData = req.body;
        delete updateData._id;
        delete updateData.uid;
        delete updateData.email;
        
        updateData.updatedAt = new Date().toISOString();
        updateData.lastActive = new Date().toISOString();

        const result = await usersCollection.updateOne({ uid: uid }, { $set: updateData });
        if (result.matchedCount === 0) return res.status(404).json({ success: false, message: "User not found" });
        
        const updatedUser = await usersCollection.findOne({ uid: uid });
        res.json({ success: true, message: "Profile updated", user: updatedUser });
      } catch (error) {
        res.status(500).json({ success: false, message: "Update failed" });
      }
    });

    app.post("/api/users/upload-photo", upload.single('photo'), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
        const { uid } = req.body;
        if (!uid) return res.status(400).json({ success: false, message: "UID required" });

        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "cwt-profiles", transformation: [{ width: 500, height: 500, crop: "fill", gravity: "face" }, { quality: "auto:good" }] },
            (error, result) => error ? reject(error) : resolve(result)
          );
          uploadStream.end(req.file.buffer);
        });

        await usersCollection.updateOne({ uid: uid }, { $set: { photoURL: uploadResult.secure_url, updatedAt: new Date().toISOString() } });
        res.json({ success: true, message: "Photo uploaded", photoURL: uploadResult.secure_url });
      } catch (error) {
        res.status(500).json({ success: false, message: "Upload failed" });
      }
    });

    app.put("/api/user", async (req, res) => {
      try {
        const userData = req.body;
        const query = { email: userData?.email };
        const existingUser = await usersCollection.findOne(query);
        
        if (existingUser) {
          userData.updatedAt = new Date().toISOString();
          userData.lastLogin = new Date().toISOString();
          await usersCollection.updateOne(query, { $set: userData });
          const updatedUser = await usersCollection.findOne(query);
          return res.json({ success: true, message: "User updated", user: updatedUser });
        } else {
          const newUser = {
            ...userData,
            uid: userData.uid || `temp_${Date.now()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            status: userData.status || "active",
            role: userData.role || "student",
            photoURL: userData.photoURL || ""
          };
          const result = await usersCollection.insertOne(newUser);
          const createdUser = await usersCollection.findOne({ _id: result.insertedId });
          return res.status(201).json({ success: true, message: "User created", user: createdUser });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: "Processing failed" });
      }
    });

    app.get("/api/users/check/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.json({ success: true, exists: !!user, user });
      } catch (error) {
        res.status(500).json({ success: false, message: "Check failed" });
      }
    });

    app.delete("/api/users/:uid", async (req, res) => {
      try {
        const { uid } = req.params;
        const user = await usersCollection.findOne({ uid });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        
        if (user.photoURL) {
          try {
            const publicId = user.photoURL.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`cwt-profiles/${publicId}`);
          } catch (error) {}
        }
        
        await usersCollection.deleteOne({ uid });
        res.json({ success: true, message: "User deleted" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Delete failed" });
      }
    });

    app.post("/api/logout", async (req, res) => {
      try {
        const { uid } = req.body;
        if (uid) await usersCollection.updateOne({ uid: uid }, { $set: { lastActive: new Date().toISOString() } });
        res.json({ success: true, message: "Logged out" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Logout failed" });
      }
    });

    // Email Verification Routes
    app.post("/api/email/send-verification", async (req, res) => {
      try {
        const { email, userId, userName } = req.body;
        if (!email || !userId) return res.status(400).json({ success: false, message: "Email and user ID required" });
        
        const user = await usersCollection.findOne({ uid: userId });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        if (user.emailVerified) return res.json({ success: true, message: "Email already verified", isVerified: true });
        
        const verificationData = emailVerifications.get(email);
        if (verificationData?.cooldownUntil && new Date() < new Date(verificationData.cooldownUntil)) {
          const remainingMs = new Date(verificationData.cooldownUntil) - new Date();
          const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
          return res.status(429).json({ success: false, message: `Too many attempts. Try in ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`, cooldownUntil: verificationData.cooldownUntil });
        }
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        emailVerifications.set(email, {
          code,
          attempts: 0,
          userId,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });
        
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'CWT - Email Verification Code',
          html: createVerificationEmail(code, userName, email)
        };
        
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Verification code sent" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to send code" });
      }
    });

    app.post("/api/email/verify-code", async (req, res) => {
      try {
        const { email, code, userId } = req.body;
        if (!email || !code || !userId) return res.status(400).json({ success: false, message: "All fields required" });
        
        const verificationData = emailVerifications.get(email);
        if (!verificationData) return res.status(400).json({ success: false, message: "No verification request found" });
        
        if (verificationData.cooldownUntil && new Date() < new Date(verificationData.cooldownUntil)) {
          return res.status(429).json({ success: false, message: "Too many attempts. Try again later.", cooldownUntil: verificationData.cooldownUntil, attemptsLeft: 0 });
        }
        
        if (new Date() > verificationData.expiresAt) {
          emailVerifications.delete(email);
          return res.status(400).json({ success: false, message: "Code expired" });
        }
        
        verificationData.attempts += 1;
        
        if (verificationData.code !== code) {
          const attemptsLeft = MAX_ATTEMPTS - verificationData.attempts;
          
          if (attemptsLeft <= 0) {
            const cooldownUntil = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);
            verificationData.cooldownUntil = cooldownUntil;
            emailVerifications.set(email, verificationData);
            return res.status(400).json({ success: false, message: "Too many attempts. Blocked for 24 hours.", cooldownUntil, attemptsLeft: 0 });
          }
          
          emailVerifications.set(email, verificationData);
          return res.status(400).json({ success: false, message: "Invalid code", attemptsLeft });
        }
        
        await usersCollection.updateOne({ uid: userId }, { $set: { emailVerified: true, updatedAt: new Date().toISOString() } });
        emailVerifications.delete(email);
        res.json({ success: true, message: "Email verified" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Verification failed" });
      }
    });

    app.get("/api/email/verification-status/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        const user = await usersCollection.findOne({ uid: userId });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        
        const verificationData = emailVerifications.get(user.email) || {};
        res.json({
          success: true,
          isVerified: user.emailVerified || false,
          isPending: !!verificationData.code,
          attemptsLeft: MAX_ATTEMPTS - (verificationData.attempts || 0),
          cooldownUntil: verificationData.cooldownUntil
        });
      } catch (error) {
        res.status(500).json({ success: false, message: "Status check failed" });
      }
    });

    setInterval(() => {
      const now = new Date();
      for (const [email, data] of emailVerifications.entries()) {
        if (now > data.expiresAt) emailVerifications.delete(email);
      }
    }, 60 * 1000);

    app.use((err, req, res, next) => {
      res.status(500).json({ success: false, message: "Server error" });
    });

    app.use((req, res) => {
      res.status(404).json({ success: false, message: "Route not found" });
    });

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

run().catch(console.dir);

process.on('SIGINT', async () => {
  await client.close();
  process.exit(0);
});