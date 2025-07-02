const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage (use database in production)
const links = new Map();

// Middleware
app.use(express.json());
app.use(express.static("public"));

// App configuration
const APP_CONFIG = {
  appName: "YourAppName",
  androidPackage: "com.yourcompany.yourapp",
  iosAppId: "123456789", // Your iOS App Store ID
  androidScheme: "yourapp",
  iosScheme: "yourapp",
  playStoreUrl:
    "https://play.google.com/store/apps/details?id=com.yourcompany.yourapp",
  appStoreUrl: "https://apps.apple.com/app/id123456789",
  fallbackUrl: "https://yourwebsite.com",
};

// Generate unique link ID
function generateLinkId() {
  return crypto.randomBytes(8).toString("hex");
}

// Create dynamic link
// app.post("/api/create-link", (req, res) => {
//   try {
//     const { path: deepLinkPath, title, description, imageUrl, data } = req.body;

//     if (!deepLinkPath) {
//       return res.status(400).json({ error: "Deep link path is required" });
//     }

//     const linkId = generateLinkId();
//     const dynamicLink = `${req.protocol}://${req.get("host")}/link/${linkId}`;

//     // Store link data
//     links.set(linkId, {
//       id: linkId,
//       path: deepLinkPath,
//       title: title || "Check out this content",
//       description: description || "Open in app for the best experience",
//       imageUrl: imageUrl || "",
//       data: data || {},
//       createdAt: new Date(),
//       clicks: 0,
//     });

//     res.json({
//       success: true,
//       dynamicLink,
//       linkId,
//     });
//   } catch (error) {
//     console.error("Error creating link:", error);
//     res.status(500).json({ error: "Failed to create dynamic link" });
//   }
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

      // add new fields
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

    // HTML with enhanced meta tags
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
          <meta property="og:video:url" content="${videoUrl}" />
          <meta property="og:video:type" content="video/mp4" />
          
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

// // Handle dynamic link clicks
// app.get("/link/:linkId", (req, res) => {
//   const { linkId } = req.params;
//   const linkData = links.get(linkId);

//   if (!linkData) {
//     return res.status(404).send("Link not found");
//   }

//   // Update click count
//   linkData.clicks++;

//   // Get user agent for platform detection
//   const userAgent = req.get("User-Agent") || "";
//   const isAndroid = /android/i.test(userAgent);
//   const isIOS = /iPad|iPhone|iPod/.test(userAgent);
//   const isMobile = isAndroid || isIOS;

//   // Generate the HTML response with detection logic
//   const html = generateLinkHTML(linkData, isAndroid, isIOS, isMobile);

//   res.send(html);
// });

// // Generate HTML with app detection and redirect logic
// function generateLinkHTML(linkData, isAndroid, isIOS, isMobile) {
//   const deepLink = isAndroid
//     ? `${APP_CONFIG.androidScheme}://${linkData.path}`
//     : `${APP_CONFIG.iosScheme}://${linkData.path}`;

//   const storeUrl = isAndroid ? APP_CONFIG.playStoreUrl : APP_CONFIG.appStoreUrl;

//   return `
// <!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>${linkData.title}</title>
    
//     <!-- Open Graph meta tags for social sharing -->
//     <meta property="og:title" content="${linkData.title}">
//     <meta property="og:description" content="${linkData.description}">
//     <meta property="og:image" content="${linkData.imageUrl}">
//     <meta property="og:type" content="website">
    
//     <!-- Twitter Card meta tags -->
//     <meta name="twitter:card" content="summary_large_image">
//     <meta name="twitter:title" content="${linkData.title}">
//     <meta name="twitter:description" content="${linkData.description}">
//     <meta name="twitter:image" content="${linkData.imageUrl}">

//     <style>
//         body {
//             font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
//             margin: 0;
//             padding: 20px;
//             background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//             min-height: 100vh;
//             display: flex;
//             align-items: center;
//             justify-content: center;
//         }
        
//         .container {
//             background: white;
//             border-radius: 12px;
//             padding: 30px;
//             max-width: 400px;
//             text-align: center;
//             box-shadow: 0 10px 30px rgba(0,0,0,0.3);
//         }
        
//         .app-icon {
//             width: 80px;
//             height: 80px;
//             background: #007AFF;
//             border-radius: 16px;
//             margin: 0 auto 20px;
//             display: flex;
//             align-items: center;
//             justify-content: center;
//             font-size: 32px;
//             color: white;
//         }
        
//         h1 {
//             color: #333;
//             margin-bottom: 10px;
//             font-size: 24px;
//         }
        
//         p {
//             color: #666;
//             margin-bottom: 30px;
//             line-height: 1.5;
//         }
        
//         .btn {
//             display: inline-block;
//             padding: 12px 24px;
//             background: #007AFF;
//             color: white;
//             text-decoration: none;
//             border-radius: 8px;
//             font-weight: 600;
//             margin: 10px;
//             transition: background 0.3s;
//         }
        
//         .btn:hover {
//             background: #0056b3;
//         }
        
//         .loading {
//             display: none;
//             color: #666;
//             margin-top: 20px;
//         }
        
//         .spinner {
//             border: 2px solid #f3f3f3;
//             border-top: 2px solid #007AFF;
//             border-radius: 50%;
//             width: 20px;
//             height: 20px;
//             animation: spin 1s linear infinite;
//             display: inline-block;
//             margin-right: 10px;
//         }
        
//         @keyframes spin {
//             0% { transform: rotate(0deg); }
//             100% { transform: rotate(360deg); }
//         }
//     </style>
// </head>
// <body>
//     <div class="container">
//         <div class="app-icon">📱</div>
//         <h1>${linkData.title}</h1>
//         <p>${linkData.description}</p>
        
//         <div id="buttons">
//             <a href="#" id="openApp" class="btn">Open in App</a>
//             <a href="${storeUrl}" id="downloadApp" class="btn">Download App</a>
//         </div>
        
//         <div id="loading" class="loading">
//             <div class="spinner"></div>
//             Opening app...
//         </div>
//     </div>

//     <script>
//         const linkData = ${JSON.stringify(linkData)};
//         const isAndroid = ${isAndroid};
//         const isIOS = ${isIOS};
//         const isMobile = ${isMobile};
//         const deepLink = "${deepLink}";
//         const storeUrl = "${storeUrl}";
//         const fallbackUrl = "${APP_CONFIG.fallbackUrl}";

//         let appOpened = false;
//         let timeout;

//         function openApp() {
//             if (!isMobile) {
//                 window.open(fallbackUrl, '_blank');
//                 return;
//             }

//             document.getElementById('loading').style.display = 'block';
//             document.getElementById('buttons').style.display = 'none';
            
//             appOpened = false;

//             // Try to open the app
//             if (isAndroid) {
//                 // Android intent fallback
//                 const intentUrl = \`intent://\${linkData.path}#Intent;scheme=\${deepLink.split('://')[0]};package=${
//                   APP_CONFIG.androidPackage
//                 };S.browser_fallback_url=\${encodeURIComponent(storeUrl)};end\`;
//                 window.location.href = intentUrl;
                
//                 // Fallback after timeout
//                 timeout = setTimeout(() => {
//                     if (!appOpened) {
//                         window.location.href = storeUrl;
//                     }
//                 }, 2500);
//             } else if (isIOS) {
//                 // iOS Universal Links or Custom Scheme
//                 window.location.href = deepLink;
                
//                 // Fallback after timeout
//                 timeout = setTimeout(() => {
//                     if (!appOpened) {
//                         window.location.href = storeUrl;
//                     }
//                 }, 2500);
//             }

//             // Detect if app opened (page visibility change)
//             document.addEventListener('visibilitychange', () => {
//                 if (document.hidden) {
//                     appOpened = true;
//                     clearTimeout(timeout);
//                 }
//             });

//             // Detect if user returns to page (app not installed)
//             window.addEventListener('focus', () => {
//                 clearTimeout(timeout);
//                 document.getElementById('loading').style.display = 'none';
//                 document.getElementById('buttons').style.display = 'block';
//             });
//         }

//         // Auto-redirect on mobile
//         if (isMobile) {
//             // Wait a bit for the page to load, then auto-open
//             setTimeout(openApp, 1000);
//         }

//         // Manual button click
//         document.getElementById('openApp').addEventListener('click', (e) => {
//             e.preventDefault();
//             openApp();
//         });

//         // Send analytics data back to server
//         fetch('/api/link-clicked', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify({
//                 linkId: linkData.id,
//                 userAgent: navigator.userAgent,
//                 platform: isAndroid ? 'android' : isIOS ? 'ios' : 'web'
//             })
//         }).catch(console.error);
//     </script>
// </body>
// </html>`;
// }

// // Track link clicks
// app.post("/api/link-clicked", (req, res) => {
//   const { linkId, userAgent, platform } = req.body;

//   // Here you would typically store analytics data
//   console.log("Link clicked:", { linkId, platform, userAgent });

//   res.json({ success: true });
// });

// Get link analytics
app.get("/api/link/:linkId/stats", (req, res) => {
  const { linkId } = req.params;
  const linkData = links.get(linkId);

  if (!linkData) {
    return res.status(404).json({ error: "Link not found" });
  }

  res.json({
    linkId,
    clicks: linkData.clicks,
    createdAt: linkData.createdAt,
    title: linkData.title,
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(`Dynamic Link Service running on port ${PORT}`);
  console.log(`Create links: POST /api/create-link`);
  console.log(`View links: GET /link/:linkId`);
});
