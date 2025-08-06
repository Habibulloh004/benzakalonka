const express = require("express");
const session = require("express-session");
const multer = require("multer");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "mediadb",
  password: process.env.DB_PASSWORD || "postgres123", // postgres123
  port: process.env.DB_PORT || 5432,
});

// Function to initialize database and create admin user
async function initializeDatabase() {
  try {
    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS media (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(10) NOT NULL,
        file_size BIGINT NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        display_order INTEGER DEFAULT 0
      )
    `);

    // Add display_order column if it doesn't exist (for existing databases)
    try {
      await pool.query(`
        ALTER TABLE media ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0
      `);
    } catch (err) {
      // Column might already exist, ignore error
    }

    // Check if any admin user exists
    const adminCheck = await pool.query("SELECT COUNT(*) FROM admins");
    const adminCount = parseInt(adminCheck.rows[0].count);

    if (adminCount === 0) {
      // Create admin user only if no admin exists
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await pool.query(
        "INSERT INTO admins (username, password) VALUES ($1, $2)",
        ["admin", hashedPassword]
      );
      console.log(
        "✅ Admin user created - Username: admin, Password: admin123"
      );
    } else {
      console.log(`✅ Found ${adminCount} admin user(s) - skipping creation`);
    }
  } catch (err) {
    console.error("❌ Database initialization error:", err);
  }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  })
);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Static files
app.use("/uploads", express.static("uploads"));
app.use(express.static("public"));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|avi|mov|wmv|webm|quicktime/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    // Define allowed MIME types including WebP and MOV
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/avi",
      "video/quicktime", // For .mov files
      "video/x-msvideo",
      "video/webm",
      "video/x-ms-wmv",
    ];

    const mimetypeAllowed = allowedMimeTypes.includes(
      file.mimetype.toLowerCase()
    );

    if (mimetypeAllowed && extname) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "Only image (JPEG, PNG, GIF, WebP) and video (MP4, AVI, MOV, WMV, WebM) files are allowed!"
        )
      );
    }
  },
});

// Middleware to check admin authentication
const requireAuth = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    res.redirect("/admin/login");
  }
};

// Routes

// User routes
app.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM media ORDER BY display_order ASC, upload_date DESC"
    );
    const media = result.rows;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Media Carousel</title>
          <style>
              * {
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
              }
              
              body, html {
                  height: 100%;
                  overflow: hidden;
                  background: #000;
                  font-family: Arial, sans-serif;
              }
              
              .carousel-container {
                  position: relative;
                  width: 100vw;
                  height: 100vh;
              }
              
              .carousel-item {
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  opacity: 0;
                  transition: opacity 0.5s ease-in-out;
              }
              
              .carousel-item.active {
                  opacity: 1;
              }
              
              .carousel-item img,
              .carousel-item video {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
              }
              
              .no-media {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  color: white;
                  font-size: 24px;
              }
          </style>
      </head>
      <body>
          ${
            media.length === 0
              ? '<div class="no-media">No media available</div>'
              : `<div class="carousel-container">
                ${media
                  .map(
                    (item, index) => `
                    <div class="carousel-item ${
                      index === 0 ? "active" : ""
                    }" data-type="${item.file_type}">
                        ${
                          item.file_type === "image"
                            ? `<img src="/uploads/${item.filename}" alt="${item.original_name}">`
                            : `<video src="/uploads/${item.filename}" muted autoplay></video>`
                        }
                    </div>
                `
                  )
                  .join("")}
            </div>`
          }
          
          // Replace the existing carousel script section with this:
          <script>
              const items = document.querySelectorAll('.carousel-item');
              let currentIndex = 0;
              
              if (items.length > 1) {
                  function showNextItem() {
                      items[currentIndex].classList.remove('active');
                      currentIndex = (currentIndex + 1) % items.length;
                      items[currentIndex].classList.add('active');
                      
                      const currentItem = items[currentIndex];
                      const isVideo = currentItem.dataset.type === 'video';
                      
                      if (isVideo) {
                          const video = currentItem.querySelector('video');
                          video.currentTime = 0;
                          video.play();
                          video.onended = showNextItem;
                      } else {
                          setTimeout(showNextItem, 5000); // 5 seconds for images
                      }
                  }
                  
                  // Start the carousel
                  const firstItem = items[0];
                  if (firstItem.dataset.type === 'video') {
                      const video = firstItem.querySelector('video');
                      video.play();
                      video.onended = showNextItem;
                  } else {
                      setTimeout(showNextItem, 5000);
                  }
              } else if (items.length === 1) {
                  // Handle single item case
                  const singleItem = items[0];
                  if (singleItem.dataset.type === 'video') {
                      const video = singleItem.querySelector('video');
                      video.play();
                      video.onended = function() {
                          video.currentTime = 0;
                          video.play();
                      };
                  }
              }
          </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Error fetching media:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Admin login page
app.get("/admin/login", (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect("/admin");
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Login</title>
        <style>
            * {
              box-sizing: border-box;
              padding: 0;
              margin: 0;
            }
            body {
                font-family: Arial, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                height: 100vh;
                margin: 0;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            .login-container {
                background: white;
                padding: 2rem;
                border-radius: 10px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                width: 100%;
                max-width: 400px;
            }
            
            h1 {
                text-align: center;
                color: #333;
                margin-bottom: 2rem;
            }
            
            .form-group {
                margin-bottom: 1rem;
            }
            
            .password-container {
                width: 100%;
            }
            
            label {
                display: block;
                margin-bottom: 0.5rem;
                color: #555;
                font-weight: bold;
            }
            
            input[type="text"],
            input[type="password"] {
                width: 100%;
                padding: 0.75rem;
                border: 2px solid #ddd;
                border-radius: 5px;
                font-size: 1rem;
                transition: border-color 0.3s;
            }
            
            input[type="text"]:focus,
            input[type="password"]:focus {
                outline: none;
                border-color: #667eea;
            }
            
            .password-toggle {
                position: absolute;
                right: 10px;
                top: 50%;
                transform: translateY(-50%);
                cursor: pointer;
                color: #666;
                user-select: none;
            }
            
            .password-toggle:hover {
                color: #333;
            }
            
            button {
                width: 100%;
                padding: 0.75rem;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 1rem;
                cursor: pointer;
                transition: background 0.3s;
            }
            
            button:hover {
                background: #5a6fd8;
            }
            
            .error {
                color: #dc3545;
                text-align: center;
                margin-top: 1rem;
            }
            
            .credentials {
                background: #f8f9fa;
                padding: 1rem;
                border-radius: 5px;
                margin-bottom: 1rem;
                text-align: center;
                font-size: 0.9rem;
                color: #666;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <h1>Admin Login</h1>
            <div class="credentials">
                <strong>Default Credentials:</strong><br>
                Username: admin<br>
                Password: admin123
            </div>
          <form action="/admin/login" method="POST">
              <div class="form-group">
                  <label for="username">Username:</label>
                  <input type="text" id="username" name="username" required>
              </div>
              <div class="form-group">
                  <label for="password">Password:</label>
                  <div class="password-container">
                      <input type="password" id="password" name="password" required>
                  </div>
              </div>
              <button type="submit">Login</button>
              ${req.query.error ? '<div class="error">Invalid credentials</div>' : ""}
          </form>

        </div>
    </body>
    </html>
  `);
});

// Admin login POST
app.post("/admin/login", async (req, res) => {
  try {
    console.log(req.body);
    const { username, password } = req.body;
    const result = await pool.query(
      "SELECT * FROM admins WHERE username = $1",
      [username]
    );

    console.log(result);

    if (result.rows.length > 0) {
      const admin = result.rows[0];
      const isValid = await bcrypt.compare(password, admin.password);

      if (isValid) {
        req.session.isAdmin = true;
        req.session.adminId = admin.id;
        res.redirect("/admin");
      } else {
        res.redirect("/admin/login?error=1");
      }
    } else {
      res.redirect("/admin/login?error=1");
    }
  } catch (err) {
    console.error("Login error:", err);
    res.redirect("/admin/login?error=1");
  }
});

// Admin dashboard
app.get("/admin", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM media ORDER BY display_order ASC, upload_date DESC"
    );
    const media = result.rows;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Admin Dashboard</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  margin: 0;
                  padding: 20px;
                  background: #f5f5f5;
              }
              
              .header {
                  background: white;
                  padding: 1rem 2rem;
                  border-radius: 10px;
                  margin-bottom: 2rem;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              
              .header h1 {
                  margin: 0;
                  color: #333;
              }
              
              .header-actions {
                  display: flex;
                  gap: 1rem;
              }
              
              .btn {
                  padding: 0.5rem 1rem;
                  border: none;
                  border-radius: 5px;
                  cursor: pointer;
                  text-decoration: none;
                  font-size: 0.9rem;
                  transition: background 0.3s;
                  display: inline-block;
                  text-align: center;
              }
              
              .btn-primary {
                  background: #007bff;
                  color: white;
              }
              
              .btn-primary:hover {
                  background: #0056b3;
              }
              
              .btn-danger {
                  background: #dc3545;
                  color: white;
              }
              
              .btn-danger:hover {
                  background: #c82333;
              }
              
              .btn-sm {
                  padding: 0.25rem 0.5rem;
                  font-size: 0.8rem;
              }
              
              .upload-section {
                  background: white;
                  padding: 2rem;
                  border-radius: 10px;
                  margin-bottom: 2rem;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              
              .upload-section h2 {
                  margin-top: 0;
                  color: #333;
              }
              
              .file-input {
                  margin-bottom: 1rem;
              }
              
              input[type="file"] {
                  width: 100%;
                  padding: 0.5rem;
                  border: 2px dashed #ddd;
                  border-radius: 5px;
              }
              
              .media-grid {
                  background: white;
                  padding: 2rem;
                  border-radius: 10px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              
              .media-grid h2 {
                  margin-top: 0;
                  color: #333;
              }
              
              .sortable-notice {
                  background: #e3f2fd;
                  border: 1px solid #2196f3;
                  border-radius: 5px;
                  padding: 0.75rem;
                  margin-bottom: 1rem;
                  color: #1976d2;
                  font-size: 0.9rem;
              }
              
              .media-items {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                  gap: 1rem;
              }
              
              .media-item {
                  border: 2px solid #ddd;
                  border-radius: 8px;
                  overflow: hidden;
                  background: #f9f9f9;
                  position: relative;
                  cursor: move;
                  transition: all 0.3s ease;
              }
              
              .media-item:hover {
                  border-color: #007bff;
                  box-shadow: 0 4px 12px rgba(0,123,255,0.15);
              }
              
              .media-item.dragging {
                  opacity: 0.5;
                  transform: rotate(5deg);
              }
              
              .media-item.drag-over {
                  border-color: #28a745;
                  background: #f8fff8;
              }
              
              .drag-handle {
                  position: absolute;
                  top: 8px;
                  left: 8px;
                  background: rgba(0,0,0,0.7);
                  color: white;
                  padding: 4px 8px;
                  border-radius: 4px;
                  font-size: 0.8rem;
                  z-index: 10;
                  cursor: move;
              }
              
              .media-preview {
                  position: relative;
                  width: 100%;
                  height: 200px;
                  background: #000;
                  overflow: hidden;
              }
              
              .media-item img,
              .media-item video {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
              }
              
              .media-info {
                  padding: 0.75rem;
                  font-size: 0.9rem;
                  color: #666;
              }
              
              .media-actions {
                  padding: 0.75rem;
                  border-top: 1px solid #eee;
                  background: #fff;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
              }
              
              .view-btn {
                  background: #17a2b8;
                  color: white;
                  margin-right: 0.5rem;
              }
              
              .view-btn:hover {
                  background: #138496;
              }
              
              .password-section {
                  background: white;
                  padding: 2rem;
                  border-radius: 10px;
                  margin-bottom: 2rem;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              
              .form-group {
                  margin-bottom: 1rem;
              }
              
              label {
                  display: block;
                  margin-bottom: 0.5rem;
                  color: #555;
                  font-weight: bold;
              }
              
              input[type="password"] {
                  width: 100%;
                  max-width: 300px;
                  padding: 0.5rem;
                  border: 1px solid #ddd;
                  border-radius: 5px;
              }
              
              .success {
                  color: #28a745;
                  margin-top: 0.5rem;
              }
              
              .error {
                  color: #dc3545;
                  margin-top: 0.5rem;
              }
              
              .delete-form {
                  display: inline;
              }
              
              /* Modal styles for media viewer */
              .modal {
                  display: none;
                  position: fixed;
                  z-index: 1000;
                  left: 0;
                  top: 0;
                  width: 100%;
                  height: 100%;
                  background-color: rgba(0,0,0,0.9);
              }
              
              .modal-content {
                  position: relative;
                  margin: auto;
                  padding: 0;
                  width: 90%;
                  max-width: 1000px;
                  height: 90vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
              }
              
              .modal img,
              .modal video {
                  max-width: 100%;
                  max-height: 100%;
                  object-fit: contain;
              }
              
              .close {
                  position: absolute;
                  top: 20px;
                  right: 35px;
                  color: #f1f1f1;
                  font-size: 40px;
                  font-weight: bold;
                  cursor: pointer;
                  z-index: 1001;
              }
              
              .close:hover {
                  color: #fff;
                  opacity: 0.8;
              }

              // In the admin dashboard styles, add these styles:
              .password-container {
                  position: relative;
                  display: inline-block;
                  width: 100%;
                  max-width: 300px;
              }

              .password-toggle {
                  position: absolute;
                  right: 10px;
                  top: 50%;
                  transform: translateY(-50%);
                  cursor: pointer;
                  color: #666;
                  user-select: none;
              }

              .password-toggle:hover {
                  color: #333;
              }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
          <script>
              function confirmDelete(filename) {
                  return confirm('Are you sure you want to delete "' + filename + '"? This action cannot be undone.');
              }
              
              function viewMedia(filename, type, originalName) {
                  const modal = document.getElementById('mediaModal');
                  const modalContent = document.querySelector('.modal-media');
                  
                  if (type === 'image') {
                      modalContent.innerHTML = '<img src="/uploads/' + filename + '" alt="' + originalName + '">';
                  } else {
                      modalContent.innerHTML = '<video src="/uploads/' + filename + '" controls autoplay></video>';
                  }
                  
                  modal.style.display = 'block';
              }
              
              function closeModal() {
                  const modal = document.getElementById('mediaModal');
                  const modalContent = document.querySelector('.modal-media');
                  modal.style.display = 'none';
                  modalContent.innerHTML = '';
              }
              
              // Close modal when clicking outside
              window.onclick = function(event) {
                  const modal = document.getElementById('mediaModal');
                  if (event.target == modal) {
                      closeModal();
                  }
              }
              
              // Initialize drag and drop after page loads
              document.addEventListener('DOMContentLoaded', function() {
                  const mediaItems = document.querySelector('.media-items');
                  
                  if (mediaItems) {
                      const sortable = Sortable.create(mediaItems, {
                          animation: 150,
                          ghostClass: 'sortable-ghost',
                          chosenClass: 'sortable-chosen',
                          dragClass: 'sortable-drag',
                          onEnd: function(evt) {
                              const mediaIds = Array.from(mediaItems.children).map(item => 
                                  item.getAttribute('data-id')
                              );
                              
                              // Send new order to server
                              fetch('/admin/reorder', {
                                  method: 'POST',
                                  headers: {
                                      'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({ order: mediaIds })
                              })
                              .then(response => response.json())
                              .then(data => {
                                  if (data.success) {
                                      console.log('Order updated successfully');
                                  } else {
                                      console.error('Failed to update order');
                                  }
                              })
                              .catch(error => {
                                  console.error('Error updating order:', error);
                              });
                          }
                      });
                  }
              });
          </script>
      </head>
      <body>
          <div class="header">
              <h1>Admin Dashboard</h1>
              <div class="header-actions">
                  <a href="/" class="btn btn-primary" target="_blank">View Carousel</a>
                  <a href="/admin/logout" class="btn btn-danger">Logout</a>
              </div>
          </div>
          
          <div class="upload-section">
              <h2>Upload Media</h2>
              <form action="/admin/upload" method="POST" enctype="multipart/form-data">
                  <div class="file-input">
                      <input type="file" name="media" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/avi,video/quicktime,video/webm,video/x-ms-wmv" multiple required>
                      <small style="color: #666; display: block; margin-top: 0.5rem;">You can select multiple files at once</small>
                  </div>
                  <button type="submit" class="btn btn-primary">Upload</button>
              </form>
              ${
                req.query.uploaded
                  ? '<div class="success">File(s) uploaded successfully!</div>'
                  : ""
              }
              ${
                req.query.upload_error
                  ? '<div class="error">Upload failed. Please try again.</div>'
                  : ""
              }
          </div>
          
          <div class="password-section">
              <h2>Change Password</h2>
              <form action="/admin/change-password" method="POST">
                  <div class="form-group">
                      <label for="currentPassword">Current Password:</label>
                      <div class="password-container">
                          <input type="password" id="currentPassword" name="currentPassword" required>
                      </div>
                  </div>
                  <div class="form-group">
                      <label for="newPassword">New Password:</label>
                      <div class="password-container">
                          <input type="password" id="newPassword" name="newPassword" required>
                      </div>
                  </div>
                  <div class="form-group">
                      <label for="confirmPassword">Confirm New Password:</label>
                      <div class="password-container">
                          <input type="password" id="confirmPassword" name="confirmPassword" required>
                      </div>
                  </div>
                  <button type="submit" class="btn btn-primary">Change Password</button>
              </form>
              ${
                req.query.password_changed
                  ? '<div class="success">Password changed successfully!</div>'
                  : ""
              }
              ${
                req.query.password_error
                  ? '<div class="error">Failed to change password. Please check your current password.</div>'
                  : ""
              }
          </div>
          
          <div class="media-grid">
              <h2>Uploaded Media (${media.length} files)</h2>
              ${
                req.query.deleted
                  ? '<div class="success">Media file deleted successfully!</div>'
                  : ""
              }
              ${
                req.query.delete_error
                  ? '<div class="error">Failed to delete media file.</div>'
                  : ""
              }
              ${
                media.length > 0
                  ? '<div class="sortable-notice">💡 Drag and drop media items to reorder them in the carousel</div>'
                  : ""
              }
              ${
                media.length === 0
                  ? "<p>No media files uploaded yet.</p>"
                  : `<div class="media-items">
                    ${media
                      .map(
                        (item) => `
                        <div class="media-item" data-id="${item.id}">
                            <div class="drag-handle">⋮⋮ Drag to reorder</div>
                            <div class="media-preview">
                                ${
                                  item.file_type === "image"
                                    ? `<img src="/uploads/${item.filename}" alt="${item.original_name}">`
                                    : `<video src="/uploads/${item.filename}" muted></video>`
                                }
                            </div>
                            <div class="media-info">
                                <div><strong>${
                                  item.original_name
                                }</strong></div>
                                <div>Size: ${(
                                  item.file_size /
                                  1024 /
                                  1024
                                ).toFixed(2)} MB</div>
                                <div>Uploaded: ${new Date(
                                  item.upload_date
                                ).toLocaleDateString()}</div>
                                <div>Type: ${
                                  item.file_type.charAt(0).toUpperCase() +
                                  item.file_type.slice(1)
                                }</div>
                            </div>
                            <div class="media-actions">
                                <div>
                                    <button onclick="viewMedia('${
                                      item.filename
                                    }', '${item.file_type}', '${
                          item.original_name
                        }')" class="btn btn-sm view-btn">View</button>
                                </div>
                                <form class="delete-form" action="/admin/delete/${
                                  item.id
                                }" method="POST" onsubmit="return confirmDelete('${
                          item.original_name
                        }')">
                                    <button type="submit" class="btn btn-danger btn-sm">Delete</button>
                                </form>
                            </div>
                        </div>
                    `
                      )
                      .join("")}
                </div>`
              }
          </div>
          
          <!-- Modal for viewing media -->
          <div id="mediaModal" class="modal">
              <span class="close" onclick="closeModal()">&times;</span>
              <div class="modal-content">
                  <div class="modal-media"></div>
              </div>
          </div>

      </body>
      </html>
    `);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Admin file upload
// Replace app.post("/admin/upload", requireAuth, upload.single("media"), ...) with:
app.post(
  "/admin/upload",
  requireAuth,
  upload.array("media", 10), // Allow up to 10 files
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.redirect("/admin?upload_error=1");
      }

      // Get the highest display_order
      const orderResult = await pool.query(
        "SELECT COALESCE(MAX(display_order), 0) as max_order FROM media"
      );
      let nextOrder = orderResult.rows[0].max_order + 1;

      // Process each file
      for (const file of req.files) {
        const fileType = file.mimetype.startsWith("image/") ? "image" : "video";

        await pool.query(
          "INSERT INTO media (filename, original_name, file_type, file_size, display_order) VALUES ($1, $2, $3, $4, $5)",
          [file.filename, file.originalname, fileType, file.size, nextOrder]
        );

        nextOrder++;
      }

      res.redirect("/admin?uploaded=1");
    } catch (err) {
      console.error("Upload error:", err);
      res.redirect("/admin?upload_error=1");
    }
  }
);

// Admin reorder media
app.post("/admin/reorder", requireAuth, async (req, res) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order)) {
      return res.json({ success: false, error: "Invalid order data" });
    }

    // Update display_order for each media item
    for (let i = 0; i < order.length; i++) {
      await pool.query("UPDATE media SET display_order = $1 WHERE id = $2", [
        i,
        order[i],
      ]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Reorder error:", err);
    res.json({ success: false, error: "Database error" });
  }
});

// Admin delete media
app.post("/admin/delete/:id", requireAuth, async (req, res) => {
  try {
    const mediaId = req.params.id;

    // Get media info before deleting
    const mediaResult = await pool.query("SELECT * FROM media WHERE id = $1", [
      mediaId,
    ]);

    if (mediaResult.rows.length === 0) {
      return res.redirect("/admin?delete_error=1");
    }

    const media = mediaResult.rows[0];
    const filePath = path.join(__dirname, "uploads", media.filename);

    // Delete from database
    await pool.query("DELETE FROM media WHERE id = $1", [mediaId]);

    // Delete physical file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.redirect("/admin?deleted=1");
  } catch (err) {
    console.error("Delete error:", err);
    res.redirect("/admin?delete_error=1");
  }
});

// Admin change password
app.post("/admin/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.redirect("/admin?password_error=1");
    }

    const result = await pool.query("SELECT * FROM admins WHERE id = $1", [
      req.session.adminId,
    ]);
    const admin = result.rows[0];

    const isValidCurrent = await bcrypt.compare(
      currentPassword,
      admin.password
    );
    if (!isValidCurrent) {
      return res.redirect("/admin?password_error=1");
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE admins SET password = $1 WHERE id = $2", [
      hashedNewPassword,
      req.session.adminId,
    ]);

    res.redirect("/admin?password_changed=1");
  } catch (err) {
    console.error("Password change error:", err);
    res.redirect("/admin?password_error=1");
  }
});

// Admin logout
app.get("/admin/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/admin/login");
});

// Start server and initialize database
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 View carousel: http://localhost:${PORT}`);
  console.log(`👤 Admin login: http://localhost:${PORT}/admin/login`);
  console.log("🔧 Initializing database...");
  await initializeDatabase();
  console.log("✅ Database initialization complete!");
});
