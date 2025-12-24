const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();

const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    console.log("Connected to MongoDB");

    const usersCollection = client.db("CWT").collection("users");

    // ==== CRUD Operations for Users ====

    // 1. GET all users
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // 2. GET single user by email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // 3. GET single user by UID (Firebase UID) - ADD THIS ROUTE
    app.get("/users/uid/:uid", async (req, res) => {
      try {
        const uid = req.params.uid;
        const result = await usersCollection.findOne({ uid });
        if (!result) {
          return res.status(404).send({ error: "User not found" });
        }
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch user" });
      }
    });

    // 4. GET single user by ID
    app.get("/users/id/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid user ID" });
        }
        const result = await usersCollection.findOne({ _id: new ObjectId(id) });
        if (!result) {
          return res.status(404).send({ error: "User not found" });
        }
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch user" });
      }
    });

    // 5. POST - Create new user (Registration) - FIXED
    app.post("/users/register", async (req, res) => {
      try {
        const user = req.body;

        // Validate required fields
        if (!user.email || !user.name || !user.uid) {
          return res.status(400).send({
            success: false,
            message: "Email, name, and UID are required",
          });
        }

        // Check if user already exists by email or uid
        const existingUserByEmail = await usersCollection.findOne({
          email: user.email,
        });
        const existingUserByUid = await usersCollection.findOne({
          uid: user.uid,
        });

        if (existingUserByEmail || existingUserByUid) {
          return res.status(200).send({
            success: false,
            message: "User already exists",
          });
        }

        // Add timestamps and default values
        user.createdAt = new Date();
        user.updatedAt = new Date();
        user.timestamp = Date.now();
        user.status = user.status || "active";
        user.role = user.role || "student";
        user.photoURL = user.photoURL || "";
        user.displayName = user.name; // Add displayName for compatibility

        const result = await usersCollection.insertOne(user);

        // Get the inserted user
        const insertedUser = await usersCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).send({
          success: true,
          message: "User created successfully",
          user: insertedUser,
        });
      } catch (error) {
        console.error("Registration error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to create user",
        });
      }
    });
    // 7. PUT - Update or create user (legacy route - keep for compatibility)
    app.put("/user", async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user?.email };
        const isExist = await usersCollection.findOne(query);

        if (isExist) {
          if (user.status === "Requested") {
            const result = await usersCollection.updateOne(query, {
              $set: {
                status: user?.status,
                updatedAt: new Date(),
              },
            });
            return res.send({
              success: true,
              message: "User status updated",
              result,
            });
          } else {
            return res.send({
              success: true,
              message: "User already exists",
              user: isExist,
            });
          }
        }

        const options = { upsert: true };
        const updateDoc = {
          $set: {
            ...user,
            timestamp: Date.now(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };
        const result = await usersCollection.updateOne(
          query,
          updateDoc,
          options
        );

        // Get the updated/created user
        const updatedUser = await usersCollection.findOne(query);

        res.send({
          success: true,
          message: "User created/updated successfully",
          user: updatedUser,
        });
      } catch (error) {
        console.error("PUT /user error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to process user",
        });
      }
    });

    // Add this PATCH route for updating user by UID
    app.patch("/users/uid/:uid", async (req, res) => {
      try {
        const { uid } = req.params;
        const updateData = req.body;

        const filter = { uid: uid };
        const updateDoc = {
          $set: {
            ...updateData,
            updatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        // Get updated user
        const updatedUser = await usersCollection.findOne(filter);

        res.send({
          success: true,
          message: "User updated successfully",
          user: updatedUser,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Failed to update user",
        });
      }
    });

    // Update the /users/register route to accept all fields
    app.post("/users/register", async (req, res) => {
      try {
        const user = req.body;

        // Validate required fields
        if (!user.email || !user.name || !user.uid) {
          return res.status(400).send({
            success: false,
            message: "Email, name, and UID are required",
          });
        }

        // Check if user already exists by email or uid
        const existingUserByEmail = await usersCollection.findOne({
          email: user.email,
        });
        const existingUserByUid = await usersCollection.findOne({
          uid: user.uid,
        });

        if (existingUserByEmail || existingUserByUid) {
          return res.status(200).send({
            success: false,
            message: "User already exists",
          });
        }

        // Set default values for ALL fields
        const completeUserData = {
          uid: user.uid,
          email: user.email,
          name: user.name,
          phone: user.phone || "",
          birthDate: user.birthDate || null,
          address: user.address || "",
          postCode: user.postCode || "",
          role: user.role || "student",
          photoURL: user.photoURL || "",
          status: user.status || "active",
          displayName: user.displayName || user.name,
          bio: user.bio || "",
          education: user.education || "",
          occupation: user.occupation || "",
          paymentMethod: user.paymentMethod || "none",
          socialLinks: user.socialLinks || {
            facebook: "",
            twitter: "",
            linkedin: "",
            github: "",
            portfolio: "",
          },
          notifications: user.notifications || {
            email: true,
            sms: false,
            push: true,
          },
          emailVerified: user.emailVerified || false,
          phoneVerified: user.phoneVerified || false,
          lastLogin: user.lastLogin || new Date().toISOString(),
          lastActive: user.lastActive || new Date().toISOString(),
          createdAt: new Date(),
          updatedAt: new Date(),
          timestamp: Date.now(),
        };

        console.log("Saving complete user data:", {
          email: completeUserData.email,
          name: completeUserData.name,
          phone: completeUserData.phone,
          birthDate: completeUserData.birthDate,
          address: completeUserData.address,
          postCode: completeUserData.postCode,
        });

        const result = await usersCollection.insertOne(completeUserData);

        // Get the inserted user
        const insertedUser = await usersCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).send({
          success: true,
          message: "User created successfully with all data",
          user: {
            _id: insertedUser._id,
            uid: insertedUser.uid,
            email: insertedUser.email,
            name: insertedUser.name,
            phone: insertedUser.phone,
            birthDate: insertedUser.birthDate,
            address: insertedUser.address,
            postCode: insertedUser.postCode,
            role: insertedUser.role,
            status: insertedUser.status,
            createdAt: insertedUser.createdAt,
          },
        });
      } catch (error) {
        console.error("Registration error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to create user",
        });
      }
    });

    // 9. GET - Check if user exists
    app.get("/users/check/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        res.send({
          success: true,
          exists: !!user,
          user: user || null,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Failed to check user",
        });
      }
    });

    // 10. Logout route
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({
            success: true,
            message: "Logged out successfully",
          });
      } catch (err) {
        console.error(err);
        res.status(500).send({
          success: false,
          message: "Failed to logout",
        });
      }
    });

    // 11. Health check
    app.get("/health", (req, res) => {
      res.send({
        success: true,
        message: "CWT Backend is running",
        timestamp: new Date().toISOString(),
      });
    });

    // 12. Test route for debugging
    app.get("/test/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send({
          success: true,
          count: users.length,
          users: users,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch users",
        });
      }
    });

    app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
      console.log(`📡 API URL: http://localhost:${port}`);
      console.log(`✅ Available routes:`);
      console.log(`   GET  /                 - Home`);
      console.log(`   GET  /health           - Health check`);
      console.log(`   GET  /users            - Get all users`);
      console.log(`   GET  /users/:email     - Get user by email`);
      console.log(`   GET  /users/uid/:uid   - Get user by Firebase UID`);
      console.log(`   POST /users/register   - Register new user`);
      console.log(`   POST /users            - Create/update user`);
      console.log(`   PUT  /user             - Update or create user`);
      console.log(`   GET  /logout           - Logout`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("🚀 CWT Backend API is running!");
});
