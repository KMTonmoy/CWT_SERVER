const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 5000;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Middleware
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for memory storage (for Cloudinary uploads)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, JPG, PNG, GIF, WebP)'));
    }
  }
});

// MongoDB connection
const uri = process.env.DB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const usersCollection = client.db("CWT").collection("users");

    // ==== HELPER FUNCTIONS ====
    const sanitizeUserData = (user) => {
      const { _id, password, ...sanitized } = user;
      return sanitized;
    };

    const updateTimestamps = (data) => {
      return {
        ...data,
        updatedAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
    };

    // ==== ROUTES ====

    // Health check
    app.get("/", (req, res) => {
      res.json({
        success: true,
        message: "🚀 CWT Backend API is running!",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      });
    });

    app.get("/api/health", (req, res) => {
      res.json({
        success: true,
        message: "CWT Backend is running",
        timestamp: new Date().toISOString(),
        database: "Connected",
        cloudinary: "Configured"
      });
    });

    // ==== USER ROUTES ====

    // 1. GET all users (admin only)
    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json({
          success: true,
          count: users.length,
          users: users.map(user => sanitizeUserData(user))
        });
      } catch (error) {
        console.error("GET /api/users error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch users"
        });
      }
    });

    // 2. GET user by email
    app.get("/api/users/email/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found"
          });
        }
        
        res.json({
          success: true,
          user: sanitizeUserData(user)
        });
      } catch (error) {
        console.error("GET /api/users/email/:email error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch user"
        });
      }
    });

    // 3. GET user by UID (Firebase UID) - Main profile route
    app.get("/api/users/uid/:uid", async (req, res) => {
      try {
        const uid = req.params.uid;
        const user = await usersCollection.findOne({ uid });
        
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found"
          });
        }
        
        res.json({
          success: true,
          user: sanitizeUserData(user)
        });
      } catch (error) {
        console.error("GET /api/users/uid/:uid error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch user"
        });
      }
    });

    // 4. GET user by MongoDB ID
    app.get("/api/users/id/:id", async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID"
          });
        }
        
        const user = await usersCollection.findOne({ _id: new ObjectId(id) });
        
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found"
          });
        }
        
        res.json({
          success: true,
          user: sanitizeUserData(user)
        });
      } catch (error) {
        console.error("GET /api/users/id/:id error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch user"
        });
      }
    });

    // 5. POST - Register new user
    app.post("/api/users/register", async (req, res) => {
      try {
        const userData = req.body;

        // Validate required fields
        if (!userData.email || !userData.name || !userData.uid) {
          return res.status(400).json({
            success: false,
            message: "Email, name, and UID are required"
          });
        }

        // Check if user already exists
        const existingUser = await usersCollection.findOne({
          $or: [
            { email: userData.email },
            { uid: userData.uid }
          ]
        });

        if (existingUser) {
          return res.status(200).json({
            success: true,
            message: "User already exists",
            user: sanitizeUserData(existingUser)
          });
        }

        // Prepare complete user data with defaults
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
          paymentMethod: userData.paymentMethod || "none",
          socialLinks: userData.socialLinks || {
            facebook: "",
            twitter: "",
            linkedin: "",
            github: "",
            portfolio: ""
          },
          notifications: userData.notifications || {
            email: true,
            sms: false,
            push: true
          },
          emailVerified: userData.emailVerified || false,
          phoneVerified: userData.phoneVerified || false,
          lastLogin: userData.lastLogin || new Date().toISOString(),
          lastActive: userData.lastActive || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          timestamp: Date.now()
        };

        // Insert user into database
        const result = await usersCollection.insertOne(completeUserData);
        
        // Get the inserted user
        const insertedUser = await usersCollection.findOne({ _id: result.insertedId });

        res.status(201).json({
          success: true,
          message: "User registered successfully",
          user: sanitizeUserData(insertedUser)
        });
      } catch (error) {
        console.error("POST /api/users/register error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to register user"
        });
      }
    });

    // 6. PATCH - Update user by UID (Profile update)
    app.patch("/api/users/uid/:uid", async (req, res) => {
      try {
        const { uid } = req.params;
        const updateData = req.body;

        // Remove sensitive fields
        delete updateData._id;
        delete updateData.uid;
        delete updateData.email;

        // Add timestamps
        const dataWithTimestamps = updateTimestamps(updateData);

        // Update user in database
        const result = await usersCollection.updateOne(
          { uid: uid },
          { $set: dataWithTimestamps }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found"
          });
        }

        // Get updated user
        const updatedUser = await usersCollection.findOne({ uid: uid });

        res.json({
          success: true,
          message: "Profile updated successfully",
          user: sanitizeUserData(updatedUser)
        });
      } catch (error) {
        console.error("PATCH /api/users/uid/:uid error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update profile"
        });
      }
    });

    // 7. PATCH - Update user photo only
    app.patch("/api/users/uid/:uid/photo", async (req, res) => {
      try {
        const { uid } = req.params;
        const { photoURL } = req.body;

        if (!photoURL) {
          return res.status(400).json({
            success: false,
            message: "Photo URL is required"
          });
        }

        const result = await usersCollection.updateOne(
          { uid: uid },
          { 
            $set: {
              photoURL: photoURL,
              updatedAt: new Date().toISOString()
            }
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found"
          });
        }

        res.json({
          success: true,
          message: "Profile photo updated successfully",
          photoURL: photoURL
        });
      } catch (error) {
        console.error("PATCH /api/users/uid/:uid/photo error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update profile photo"
        });
      }
    });

    // 8. POST - Upload photo to Cloudinary
    app.post("/api/users/upload-photo", upload.single('photo'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "No file uploaded"
          });
        }

        const { uid } = req.body;
        if (!uid) {
          return res.status(400).json({
            success: false,
            message: "User UID is required"
          });
        }

        // Upload to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: "cwt-profiles",
              resource_type: "image",
              transformation: [
                { width: 500, height: 500, crop: "fill", gravity: "face" },
                { quality: "auto:good" }
              ]
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );

          uploadStream.end(req.file.buffer);
        });

        // Update user's photo URL in database
        const result = await usersCollection.updateOne(
          { uid: uid },
          {
            $set: {
              photoURL: uploadResult.secure_url,
              updatedAt: new Date().toISOString()
            }
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found"
          });
        }

        res.json({
          success: true,
          message: "Photo uploaded successfully",
          photoURL: uploadResult.secure_url,
          cloudinaryData: {
            public_id: uploadResult.public_id,
            format: uploadResult.format,
            bytes: uploadResult.bytes
          }
        });
      } catch (error) {
        console.error("POST /api/users/upload-photo error:", error);
        res.status(500).json({
          success: false,
          message: error.message || "Failed to upload photo"
        });
      }
    });

    // 9. PUT - Legacy update route (for compatibility)
    app.put("/api/user", async (req, res) => {
      try {
        const userData = req.body;
        const query = { email: userData?.email };
        const existingUser = await usersCollection.findOne(query);

        if (existingUser) {
          // Update existing user
          const updateDoc = {
            $set: updateTimestamps({
              ...userData,
              lastLogin: new Date().toISOString()
            })
          };

          const result = await usersCollection.updateOne(query, updateDoc);
          const updatedUser = await usersCollection.findOne(query);

          return res.json({
            success: true,
            message: "User updated successfully",
            user: sanitizeUserData(updatedUser)
          });
        } else {
          // Create new user
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

          return res.status(201).json({
            success: true,
            message: "User created successfully",
            user: sanitizeUserData(createdUser)
          });
        }
      } catch (error) {
        console.error("PUT /api/user error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to process user"
        });
      }
    });

    // 10. GET - Check if user exists
    app.get("/api/users/check/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        res.json({
          success: true,
          exists: !!user,
          user: user ? sanitizeUserData(user) : null
        });
      } catch (error) {
        console.error("GET /api/users/check/:email error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to check user"
        });
      }
    });

    // 11. DELETE - Delete user (admin only)
    app.delete("/api/users/:uid", async (req, res) => {
      try {
        const { uid } = req.params;

        // Check if user exists
        const user = await usersCollection.findOne({ uid });
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found"
          });
        }

        // Delete from Cloudinary if photo exists
        if (user.photoURL) {
          try {
            const publicId = user.photoURL.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`cwt-profiles/${publicId}`);
          } catch (cloudinaryError) {
            console.warn("Failed to delete from Cloudinary:", cloudinaryError);
          }
        }

        // Delete from database
        await usersCollection.deleteOne({ uid });

        res.json({
          success: true,
          message: "User deleted successfully"
        });
      } catch (error) {
        console.error("DELETE /api/users/:uid error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete user"
        });
      }
    });

    // 12. Logout route
    app.post("/api/logout", async (req, res) => {
      try {
        // Update lastActive timestamp
        const { uid } = req.body;
        if (uid) {
          await usersCollection.updateOne(
            { uid: uid },
            { $set: { lastActive: new Date().toISOString() } }
          );
        }

        res.json({
          success: true,
          message: "Logged out successfully"
        });
      } catch (error) {
        console.error("POST /api/logout error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to logout"
        });
      }
    });

    // ==== ERROR HANDLING MIDDLEWARE ====
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({
        success: false,
        message: "Something went wrong!",
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.url}`
      });
    });

    // Start server
    app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
      console.log(`📡 API URL: http://localhost:${port}`);
      console.log(`🌐 Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Configured' : 'Not configured'}`);
      console.log(`✅ Available routes:`);
      console.log(`   GET  /api/health              - Health check`);
      console.log(`   GET  /api/users               - Get all users`);
      console.log(`   GET  /api/users/uid/:uid      - Get user by UID`);
      console.log(`   POST /api/users/register      - Register new user`);
      console.log(`   PATCH /api/users/uid/:uid     - Update user profile`);
      console.log(`   POST /api/users/upload-photo  - Upload profile photo`);
    });

  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

run().catch(console.dir);

// Graceful shutdown 
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await client.close();
  process.exit(0);
});