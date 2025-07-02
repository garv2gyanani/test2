// Import required libraries
const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

// Load your Firebase service account credentials
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (error) {
  console.error("Error loading service account key:", error.message);
  console.error("Please make sure GOOGLE_CREDENTIALS env var is valid JSON");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Firestore DB instance
const db = admin.firestore();

// Initialize Express app
const app = express();

// Middleware
app.use(
  express.json({
    limit: "50mb",
    verify: (req, res, buf) => {
      try {
        if (buf.length > 0) JSON.parse(buf.toString());
      } catch (e) {
        console.error("⚠️ Invalid JSON received:", e.message);
        throw new Error("Invalid JSON format");
      }
    },
  })
);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Helper: generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: format phone number
function formatPhoneNumber(phone) {
  if (!phone) return null;
  if (phone.startsWith("+")) return phone;
  if (phone.length === 10) return `+91${phone}`;
  if (phone.startsWith("91") && phone.length === 12) return `+${phone}`;
  return `+${phone}`;
}

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ message: "Invalid JSON payload" });
  }
  next(err);
});

app.get("/share/video/:videoId", async (req, res) => {
  const { videoId } = req.params;

  try {
    // load video metadata from Firestore
    const videoDoc = await db.collection("bunny").doc(videoId).get();

    // default fallback values
    let title = "Check out this video!";
    let description = "Shared from VideosAlarm";
    let thumbnailUrl = "https://www.videosalarm.com/default-image.png";

    // extra metadata
    let category = "";
    let director = "";
    let duration = "";
    let releaseYear = "";
    let starcast = "";
    let videoUrl = "";

    if (videoDoc.exists) {
      const data = videoDoc.data();
      title = data.title || title;
      description = data.description || description;
      thumbnailUrl = data.thumbnailUrl || thumbnailUrl;

      category = data.category || "";
      director = data.director || "";
      duration = data.duration || "";
      releaseYear = data.releaseYear || "";
      starcast = data.starcast || "";
      videoUrl = data.videoUrl || "";
    }

    console.log(`Loaded share metadata for video ${videoId}:`, {
      title,
      description,
      thumbnailUrl,
      category,
      director,
      duration,
      releaseYear,
      starcast,
      videoUrl,
    });

    // app open link
    const appUrl = `videosalarm://video/${videoId}`;

    // fallback store link
    const userAgent = req.get("User-Agent") || "";
    let fallbackUrl, storeName;

    if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
      fallbackUrl = "https://apps.apple.com/app/id6459475100";
      storeName = "the App Store";
    } else if (userAgent.includes("Android")) {
      fallbackUrl =
        "https://play.google.com/store/apps/details?id=com.videosalarm.app";
      storeName = "the Play Store";
    } else {
      fallbackUrl = "https://www.videosalarm.com";
      storeName = "our website";
    }

    // HTML with corrected meta tags
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">

          <!-- Open Graph -->
          <meta property="og:title" content="${title}" />
          <meta property="og:description" content="${description}" />
          <meta property="og:image" content="${thumbnailUrl}" />
          <meta property="og:type" content="video.other" />

          <!-- Twitter -->
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${title}">
          <meta name="twitter:description" content="${description}">
          <meta name="twitter:image" content="${thumbnailUrl}">

          <!-- Extra video metadata -->
          <meta name="video:category" content="${category}">
          <meta name="video:director" content="${director}">
          <meta name="video:duration" content="${duration}">
          <meta name="video:release_year" content="${releaseYear}">
          <meta name="video:starcast" content="${starcast}">

          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px 20px; background: #0a0a14; color: white; }
            p { font-size: 1.1em; }
          </style>
          <script>
            function openAppOrRedirect() {
              const appUrl = '${appUrl}';
              const fallbackUrl = '${fallbackUrl}';
              let timer;
              const onHidden = () => {
                if (document.hidden) {
                  clearTimeout(timer);
                  document.removeEventListener('visibilitychange', onHidden);
                }
              }
              document.addEventListener('visibilitychange', onHidden);
              timer = setTimeout(() => { window.location.href = fallbackUrl; }, 2500);
              window.location.href = appUrl;
            }
            window.addEventListener('load', openAppOrRedirect);
          </script>
        </head>
        <body>
          <h2>Opening content in VideosAlarm...</h2>
          <p>If the app doesn't open automatically, you will be redirected to ${storeName}.</p>
        </body>
      </html>
    `;

    res.send(htmlResponse);
  } catch (error) {
    console.error("Error building share page:", error);
    res.status(500).send("Something went wrong");
  }
});

app.post("/checkUserExists", async (req, res) => {
  const { phone } = req.body;
  if (!phone)
    return res.status(400).json({ message: "Phone number is required" });

  const formattedPhone = formatPhoneNumber(phone);
  try {
    try {
      await admin.auth().getUserByPhoneNumber(formattedPhone);
      return res.status(200).json({ exists: true });
    } catch (authError) {
      if (authError.code === "auth/user-not-found") {
        const snapshot = await db
          .collection("users")
          .where("phone", "==", phone)
          .limit(1)
          .get();
        return res.status(200).json({ exists: !snapshot.empty });
      } else {
        throw authError;
      }
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error during user check" });
  }
});

app.post("/sendOtp", async (req, res) => {
  const { phone } = req.body;
  if (!phone)
    return res.status(400).json({ message: "Phone number is required" });

  const demoNumber = "9057290632";
  let otp = phone === demoNumber ? "123456" : generateOTP();

  try {
    await db.collection("otp_requests").doc(phone).set({
      otp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const smsMessage = `Dear User, your OTP is ${otp}. Do not share it with anyone. Valid for 5 minutes. -Team Videos Alarm`;
    const smsUrl = `https://smpp1.sms24hours.com/SMSApi/send?userid=ccfeltd&password=Eq5Q79b6&sendMethod=quick&mobile=${phone}&msg=${encodeURIComponent(
      smsMessage
    )}&senderid=VALARM&msgType=text&dltEntityId=1401613590000051630&dltTemplateId=1407174401860143284&duplicatecheck=true&output=json`;

    const response = await axios.get(smsUrl);
    res.status(200).json({ message: "OTP sent" });
  } catch (err) {
    res.status(500).json({ message: "Failed to send OTP", error: err.message });
  }
});

app.post("/verifyOtp", async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp)
    return res.status(400).json({ message: "Phone and OTP are required" });

  try {
    const docRef = db.collection("otp_requests").doc(phone);
    const doc = await docRef.get();

    if (!doc.exists)
      return res.status(400).json({ message: "OTP not found or already used" });

    const data = doc.data();
    const createdAt = data.createdAt?.toDate();
    const now = new Date();
    const timeDiff = (now - createdAt) / 1000;

    const isDemo = phone === "9057290632";
    const isOtpValid = isDemo ? otp === "123456" : data.otp === otp;

    if (!isOtpValid) return res.status(400).json({ message: "Invalid OTP" });
    if (timeDiff > 300) {
      await docRef.delete();
      return res.status(400).json({ message: "OTP expired" });
    }

    const formattedPhone = formatPhoneNumber(phone);
    let userRecord;

    try {
      userRecord = await admin.auth().getUserByPhoneNumber(formattedPhone);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        userRecord = await admin
          .auth()
          .createUser({ phoneNumber: formattedPhone });
        await db.collection("users").doc(userRecord.uid).set({
          phone: phone,
          phoneFormatted: formattedPhone,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        throw error;
      }
    }

    const customToken = await admin.auth().createCustomToken(userRecord.uid);
    await docRef.delete();

    res.status(200).json({
      token: customToken,
      uid: userRecord.uid,
      message: "OTP verified and token generated",
    });
  } catch (err) {
    res.status(500).json({
      message: "Internal server error during OTP verification",
      error: err.message,
    });
  }
});

// ===== File Deletion =====
app.delete("/deleteImage/:filename", (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(uploadsDir, filename);

  fs.unlink(filepath, (err) => {
    if (err) {
      if (err.code === "ENOENT")
        return res.status(404).json({ message: "File not found" });
      return res.status(500).json({ message: "Error deleting file" });
    }
    res.status(200).json({ message: "File deleted successfully" });
  });
});

// ===== Health Check =====
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ===== NEW: Send Video Notification with Dynamic Title =====
app.post("/sendVideoNotification", async (req, res) => {
  const { title } = req.body;

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }

  const message = {
    notification: {
      title: "New Video Uploaded!",
      body: `${title} is now available to watch.`,
    },
    data: {
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      title: "New Video Uploaded!",
      body: `${title} is now available to watch.`,
    },
    topic: "new-videos",
    apns: {
      payload: {
        aps: {
          alert: {
            title: "New Video Uploaded!",
            body: `${title} is now available to watch.`,
          },
          sound: "default",
        },
      },
      headers: {
        "apns-priority": "10",
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    res.status(200).json({ message: "Notification sent", id: response });
  } catch (error) {
    console.error("Error sending notification:", error);
    res
      .status(500)
      .json({ message: "Failed to send notification", error: error.message });
  }
});

// ===== Server Setup =====
function startServer(port) {
  const server = app
    .listen(port, () => {
      console.log(`✅ Server running on http://localhost:${port}`);
    })
    .on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.warn(
          `⚠️ Port ${port} is already in use, trying ${port + 1}...`
        );
        startServer(port + 1);
      } else {
        console.error("❌ Server error:", err);
      }
    });
}

const PORT = process.env.PORT || 3066;
startServer(PORT);

process.on("SIGTERM", () => {
  console.log("👋 SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("👋 SIGINT received, shutting down gracefully");
  process.exit(0);
});

module.exports = app;
