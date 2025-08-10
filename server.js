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
  password: process.env.DB_PASSWORD || "postgres123",
  port: process.env.DB_PORT || 5432,
});

app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Accept-Ranges", "bytes");
    next();
  },
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "365d",
    etag: true,
    immutable: true,
    setHeaders: (res, filePath) => {
      // MIME to'g'ri bo'lsin (kerak bo'lsa)
      if (filePath.endsWith(".mp4")) res.setHeader("Content-Type", "video/mp4");
      if (filePath.endsWith(".webm")) res.setHeader("Content-Type", "video/webm");
    },
  })
);

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

    // New tables for gas stations and TVs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gas_stations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tvs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        gas_station_id INTEGER REFERENCES gas_stations(id) ON DELETE CASCADE,
        image_transition_time INTEGER DEFAULT 5000,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tv_media (
        id SERIAL PRIMARY KEY,
        tv_id INTEGER REFERENCES tvs(id) ON DELETE CASCADE,
        media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
        is_active BOOLEAN DEFAULT true,
        display_order INTEGER DEFAULT 0,
        UNIQUE(tv_id, media_id)
      )
    `);

    // Check if any admin user exists
    const adminCheck = await pool.query("SELECT COUNT(*) FROM admins");
    const adminCount = parseInt(adminCheck.rows[0].count);

    if (adminCount === 0) {
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

    // Create default gas station and TV if none exist
    const stationCheck = await pool.query("SELECT COUNT(*) FROM gas_stations");
    if (parseInt(stationCheck.rows[0].count) === 0) {
      await pool.query(
        "INSERT INTO gas_stations (name, location) VALUES ($1, $2)",
        ["Main Station", "Default Location"]
      );

      const stationResult = await pool.query(
        "SELECT id FROM gas_stations LIMIT 1"
      );
      const stationId = stationResult.rows[0].id;

      await pool.query(
        "INSERT INTO tvs (name, gas_station_id) VALUES ($1, $2)",
        ["TV-1", stationId]
      );
      console.log("✅ Created default gas station and TV");
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
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
  })
);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Static files with caching
app.use(
  "/uploads",
  express.static("uploads", {
    maxAge: "1d", // Cache for 1 day
    etag: true,
    lastModified: true,
  })
);
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

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/avi",
      "video/quicktime",
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

// Admin dashboard - continuation of server.js
// Enhanced Admin Dashboard Route - Replace the existing /admin route in server.js

// Enhanced Admin Dashboard Route - Complete Fixed Version
app.get("/admin", requireAuth, async (req, res) => {
  try {
    const mediaResult = await pool.query(
      "SELECT * FROM media ORDER BY display_order ASC, upload_date DESC"
    );
    const stationsResult = await pool.query(`
      SELECT gs.*, 
             COUNT(t.id) as tv_count 
      FROM gas_stations gs 
      LEFT JOIN tvs t ON gs.id = t.gas_station_id 
      GROUP BY gs.id 
      ORDER BY gs.name
    `);
    const tvsResult = await pool.query(`
      SELECT t.*, gs.name as station_name 
      FROM tvs t 
      JOIN gas_stations gs ON t.gas_station_id = gs.id 
      ORDER BY gs.name, t.name
    `);

    const media = mediaResult.rows;
    const stations = stationsResult.rows;
    const tvs = tvsResult.rows;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Gas Station Admin Dashboard</title>
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
              
              .header h1 { margin: 0; color: #333; }
              .header-actions { display: flex; gap: 1rem; }
              
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
              
              .btn-primary { background: #007bff; color: white; }
              .btn-primary:hover { background: #0056b3; }
              .btn-success { background: #28a745; color: white; }
              .btn-success:hover { background: #218838; }
              .btn-danger { background: #dc3545; color: white; }
              .btn-danger:hover { background: #c82333; }
              .btn-info { background: #17a2b8; color: white; }
              .btn-info:hover { background: #138496; }
              .btn-warning { background: #ffc107; color: #212529; }
              .btn-warning:hover { background: #e0a800; }
              .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.8rem; }
              
              .section {
                  background: white;
                  padding: 2rem;
                  border-radius: 10px;
                  margin-bottom: 2rem;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              
              .section h2 { margin-top: 0; color: #333; }
              
              .tabs {
                  display: flex;
                  border-bottom: 2px solid #eee;
                  margin-bottom: 2rem;
              }
              
              .tab {
                  padding: 1rem 2rem;
                  cursor: pointer;
                  border-bottom: 2px solid transparent;
                  transition: all 0.3s;
              }
              
              .tab.active {
                  border-bottom-color: #007bff;
                  color: #007bff;
                  font-weight: bold;
              }
              
              .tab-content { display: none; }
              .tab-content.active { display: block; }
              
              .grid {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                  gap: 1rem;
              }
              
              .card {
                  border: 1px solid #ddd;
                  border-radius: 8px;
                  padding: 1rem;
                  background: #f9f9f9;
              }
              
              .card h3 { margin-top: 0; color: #333; }
              
              .form-row {
                  display: flex;
                  gap: 1rem;
                  margin-bottom: 1rem;
              }
              
              .form-group {
                  flex: 1;
                  margin-bottom: 1rem;
              }
              
              label {
                  display: block;
                  margin-bottom: 0.5rem;
                  color: #555;
                  font-weight: bold;
              }
              
              input[type="text"],
              input[type="file"],
              input[type="number"],
              input[type="password"],
              select {
                  width: 100%;
                  padding: 0.5rem;
                  border: 1px solid #ddd;
                  border-radius: 5px;
                  font-size: 1rem;
                  box-sizing: border-box;
              }
              
              input[type="file"] {
                  border: 2px dashed #ddd;
              }
              
              .media-item {
                  border: 2px solid #ddd;
                  border-radius: 8px;
                  overflow: hidden;
                  background: #f9f9f9;
                  transition: all 0.3s ease;
                  cursor: move;
                  position: relative;
              }
              
              .media-item:hover {
                  border-color: #007bff;
                  box-shadow: 0 4px 12px rgba(0,123,255,0.15);
              }
              
              .media-item.sortable-ghost {
                  opacity: 0.4;
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
                  width: 100%;
                  height: 200px;
                  background: #000;
                  overflow: hidden;
                  position: relative;
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
                  gap: 0.5rem;
              }
              
              .success { color: #28a745; margin-top: 0.5rem; }
              .error { color: #dc3545; margin-top: 0.5rem; }
              
              .modal {
                  display: none;
                  position: fixed;
                  z-index: 1000;
                  left: 0;
                  top: 0;
                  width: 100%;
                  height: 100%;
                  background-color: rgba(0,0,0,0.5);
              }
              
              .modal-content {
                  background-color: white;
                  margin: 2% auto;
                  padding: 20px;
                  border-radius: 10px;
                  width: 95%;
                  max-width: 1200px;
                  max-height: 90vh;
                  overflow-y: auto;
              }
              
              .close {
                  color: #aaa;
                  float: right;
                  font-size: 28px;
                  font-weight: bold;
                  cursor: pointer;
              }
              
              .close:hover { color: black; }
              
              .tv-link {
                  display: inline-block;
                  padding: 0.25rem 0.5rem;
                  background: #e9ecef;
                  border-radius: 3px;
                  text-decoration: none;
                  color: #495057;
                  margin: 2px;
                  font-size: 0.8rem;
              }
              
              .tv-link:hover {
                  background: #007bff;
                  color: white;
              }
              
              .media-assignment {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 2rem;
                  margin-top: 2rem;
              }
              
              .available-media,
              .assigned-media {
                  border: 1px solid #ddd;
                  border-radius: 8px;
                  padding: 1rem;
                  min-height: 400px;
              }
              
              .available-media h4,
              .assigned-media h4 {
                  margin-top: 0;
                  padding-bottom: 0.5rem;
                  border-bottom: 1px solid #eee;
              }
              
              .media-list {
                  max-height: 500px;
                  overflow-y: auto;
              }
              
              .media-assignment-item {
                  display: flex;
                  align-items: center;
                  padding: 0.5rem;
                  border: 1px solid #ddd;
                  margin: 0.25rem 0;
                  border-radius: 5px;
                  cursor: move;
                  background: white;
                  transition: background 0.2s;
              }
              
              .media-assignment-item:hover {
                  background: #f8f9fa;
              }
              
              .media-assignment-item.sortable-ghost {
                  opacity: 0.4;
              }
              
              .media-assignment-item.sortable-chosen {
                  background: #e3f2fd;
              }
              
              .media-assignment-item img,
              .media-assignment-item video {
                  width: 60px;
                  height: 40px;
                  object-fit: cover;
                  margin-right: 1rem;
                  border-radius: 3px;
              }
              
              .media-assignment-info {
                  flex: 1;
              }
              
              .media-assignment-info strong {
                  display: block;
                  font-size: 0.9rem;
              }
              
              .media-assignment-info small {
                  color: #666;
                  font-size: 0.8rem;
              }
              
              .assignment-actions {
                  display: flex;
                  gap: 0.25rem;
              }
              
              .tv-selector {
                  background: #f8f9fa;
                  padding: 1rem;
                  border-radius: 8px;
                  margin-bottom: 1rem;
              }
              
              .sortable-placeholder {
                  background: #e3f2fd;
                  border: 2px dashed #2196f3;
                  margin: 0.25rem 0;
                  height: 60px;
                  border-radius: 5px;
              }
              
              .loading {
                  text-align: center;
                  padding: 2rem;
                  color: #666;
              }
              
              .drag-handle-small {
                  margin-right: 0.5rem;
                  color: #666;
                  cursor: grab;
                  font-size: 0.9rem;
              }
              
              .drag-handle-small:active {
                  cursor: grabbing;
              }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
      </head>
      <body>
          <div class="header">
              <h1>Gas Station Admin Dashboard</h1>
              <div class="header-actions">
                  <a href="/admin/logout" class="btn btn-danger">Logout</a>
              </div>
          </div>
          
          <div class="section">
              <div class="tabs">
                  <div class="tab active" data-tab="stations">Gas Stations & TVs</div>
                  <div class="tab" data-tab="media">Media Management</div>
                  <div class="tab" data-tab="assignments">TV Media Assignment</div>
                  <div class="tab" data-tab="settings">Settings</div>
              </div>
              
              <!-- Gas Stations Tab -->
              <div id="stations" class="tab-content active">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                      <h2>Gas Stations & TVs Management</h2>
                      <div>
                          <button onclick="openStationModal()" class="btn btn-success">Add Gas Station</button>
                          <button onclick="openTVModal()" class="btn btn-primary">Add TV</button>
                      </div>
                  </div>
                  
                  <div class="grid">
                      ${stations
                        .map(
                          (station) => `
                          <div class="card">
                              <h3>${station.name}</h3>
                              <p><strong>Location:</strong> ${
                                station.location || "Not specified"
                              }</p>
                              <p><strong>TVs:</strong> ${station.tv_count}</p>
                              <div style="margin-top: 1rem;">
                                  ${tvs
                                    .filter(
                                      (tv) => tv.gas_station_id === station.id
                                    )
                                    .map(
                                      (tv) => `
                                      <a href="/tv/${tv.id}" target="_blank" class="tv-link">
                                          ${tv.name} →
                                      </a>
                                  `
                                    )
                                    .join("")}
                              </div>
                              <div style="margin-top: 1rem;">
                                  <button onclick="editStation(${
                                    station.id
                                  }, '${station.name.replace(
                            /'/g,
                            "\\'"
                          )}', '${(station.location || "").replace(
                            /'/g,
                            "\\'"
                          )}' )" 
                                          class="btn btn-sm btn-info">Edit</button>
                                  <button onclick="deleteStation(${
                                    station.id
                                  })" 
                                          class="btn btn-sm btn-danger">Delete</button>
                              </div>
                          </div>
                      `
                        )
                        .join("")}
                  </div>
                  
                  <h3 style="margin-top: 3rem;">All TVs</h3>
                  <div class="grid">
                      ${tvs
                        .map(
                          (tv) => `
                          <div class="card">
                              <h4>${tv.name}</h4>
                              <p><strong>Station:</strong> ${
                                tv.station_name
                              }</p>
                              <p><strong>Image Timing:</strong> ${
                                tv.image_transition_time / 1000
                              }s</p>
                              <div style="margin-top: 1rem;">
                                  <a href="/tv/${
                                    tv.id
                                  }" target="_blank" class="btn btn-sm btn-success">View TV</a>
                                  <button onclick="openMediaAssignmentModal(${
                                    tv.id
                                  }, '${tv.name.replace(/'/g, "\\'")}')" 
                                          class="btn btn-sm btn-warning">Assign Media</button>
                                  <button onclick="editTV(${
                                    tv.id
                                  }, '${tv.name.replace(/'/g, "\\'")}', ${
                            tv.gas_station_id
                          }, ${tv.image_transition_time})" 
                                          class="btn btn-sm btn-info">Edit</button>
                                  <button onclick="deleteTV(${tv.id})" 
                                          class="btn btn-sm btn-danger">Delete</button>
                              </div>
                          </div>
                      `
                        )
                        .join("")}
                  </div>
              </div>
              
              <!-- Media Tab -->
              <div id="media" class="tab-content">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                      <h2>Media Management</h2>
                  </div>
                  
                  <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                      <h3>Upload Media</h3>
                      <form action="/admin/upload" method="POST" enctype="multipart/form-data">
                          <div class="form-group">
                              <input type="file" name="media" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/avi,video/quicktime,video/webm,video/x-ms-wmv" multiple required>
                              <small style="color: #666; display: block; margin-top: 0.5rem;">Select multiple files at once (Images: JPEG, PNG, GIF, WebP | Videos: MP4, AVI, MOV, WMV, WebM)</small>
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
                  
                  <h3>Uploaded Media (${media.length} files)</h3>
                  <div class="grid" id="mediaGrid">
                      ${
                        media.length === 0
                          ? "<p>No media files uploaded yet.</p>"
                          : media
                              .map(
                                (item) => `
                          <div class="media-item" data-id="${item.id}">
                              <div class="drag-handle">⋮⋮ Drag to reorder</div>
                              <div class="media-preview">
                                  ${
                                    item.file_type === "image"
                                      ? `<img src="/uploads/${item.filename}" alt="${item.original_name}">`
                                      : `<video src="/uploads/${item.filename}" muted>
                                         <source src="/uploads/${item.filename}" type="video/mp4">
                                         Your browser does not support the video tag.
                                       </video>`
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
                                  <button onclick="viewMedia('${
                                    item.filename
                                  }', '${item.file_type}', '${
                                  item.original_name
                                }')" 
                                          class="btn btn-sm btn-info">View</button>
                                  <button onclick="deleteMedia(${
                                    item.id
                                  }, '${item.original_name.replace(
                                  /'/g,
                                  "\\'"
                                )}')" 
                                          class="btn btn-sm btn-danger">Delete</button>
                              </div>
                          </div>
                        `
                              )
                              .join("")
                      }
                  </div>
              </div>
              
              <!-- TV Media Assignment Tab -->
              <div id="assignments" class="tab-content">
                  <h2>TV Media Assignment</h2>
                  <div class="tv-selector">
                      <label for="assignmentTvSelect">Select TV to manage:</label>
                      <select id="assignmentTvSelect" onchange="loadTVMediaAssignment(this.value)">
                          <option value="">Choose a TV...</option>
                          ${tvs
                            .map(
                              (tv) => `
                              <option value="${tv.id}">${tv.station_name} - ${tv.name}</option>
                          `
                            )
                            .join("")}
                      </select>
                  </div>
                  
                  <div id="assignmentContent" style="display: none;">
                      <div class="media-assignment">
                          <div class="available-media">
                              <h4>Available Media</h4>
                              <div id="availableMediaList" class="media-list"></div>
                          </div>
                          <div class="assigned-media">
                              <h4>Assigned Media (Drag to reorder)</h4>
                              <div id="assignedMediaList" class="media-list"></div>
                          </div>
                      </div>
                      <div style="text-align: center; margin-top: 2rem;">
                          <button onclick="saveAssignments()" class="btn btn-primary">Save Media Assignment</button>
                      </div>
                  </div>
              </div>
              
              <!-- Settings Tab -->
              <div id="settings" class="tab-content">
                  <h2>Admin Settings</h2>
                  <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px;">
                      <h3>Change Password</h3>
                      <form action="/admin/change-password" method="POST">
                          <div class="form-row">
                              <div class="form-group">
                                  <label for="currentPassword">Current Password:</label>
                                  <input type="password" id="currentPassword" name="currentPassword" required>
                              </div>
                              <div class="form-group">
                                  <label for="newPassword">New Password:</label>
                                  <input type="password" id="newPassword" name="newPassword" required>
                              </div>
                              <div class="form-group">
                                  <label for="confirmPassword">Confirm New Password:</label>
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
                          ? '<div class="error">Failed to change password.</div>'
                          : ""
                      }
                  </div>
              </div>
          </div>
          
          <!-- Station Modal -->
          <div id="stationModal" class="modal">
              <div class="modal-content">
                  <span class="close" onclick="closeStationModal()">&times;</span>
                  <h2 id="stationModalTitle">Add Gas Station</h2>
                  <form id="stationForm" action="/admin/stations" method="POST">
                      <input type="hidden" id="stationId" name="stationId">
                      <div class="form-group">
                          <label for="stationName">Station Name:</label>
                          <input type="text" id="stationName" name="name" required>
                      </div>
                      <div class="form-group">
                          <label for="stationLocation">Location:</label>
                          <input type="text" id="stationLocation" name="location">
                      </div>
                      <button type="submit" class="btn btn-primary">Save Station</button>
                  </form>
              </div>
          </div>
          
          <!-- TV Modal -->
          <div id="tvModal" class="modal">
              <div class="modal-content">
                  <span class="close" onclick="closeTVModal()">&times;</span>
                  <h2 id="tvModalTitle">Add TV</h2>
                  <form id="tvForm" action="/admin/tvs" method="POST">
                      <input type="hidden" id="tvId" name="tvId">
                      <div class="form-group">
                          <label for="tvName">TV Name:</label>
                          <input type="text" id="tvName" name="name" required>
                      </div>
                      <div class="form-group">
                          <label for="tvStation">Gas Station:</label>
                          <select id="tvStation" name="gas_station_id" required>
                              ${stations
                                .map(
                                  (station) =>
                                    `<option value="${station.id}">${station.name}</option>`
                                )
                                .join("")}
                          </select>
                      </div>
                      <div class="form-group">
                          <label for="tvTiming">Image Transition Time (seconds):</label>
                          <input type="number" id="tvTiming" name="image_transition_time" value="5" min="1" max="60" required>
                      </div>
                      <button type="submit" class="btn btn-primary">Save TV</button>
                  </form>
              </div>
          </div>
          
          <!-- Media Assignment Modal -->
          <div id="mediaAssignmentModal" class="modal">
              <div class="modal-content">
                  <span class="close" onclick="closeMediaAssignmentModal()">&times;</span>
                  <h2 id="mediaAssignmentTitle">Assign Media to TV</h2>
                  <div id="modalAssignmentContent">
                      <div class="loading">Loading media...</div>
                  </div>
              </div>
          </div>

<script>
    // Global variables
    let currentTVId = null;
    let modalCurrentTVId = null;
    let availableSortable = null;
    let assignedSortable = null;
    let modalAvailableSortable = null;
    let modalAssignedSortable = null;
    let mediaSortable = null;
    
    // Tab functionality
    function showTab(tabName) {
        // Remove active class from all tabs and content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Add active class to selected tab and content
        document.getElementById(tabName).classList.add('active');
        document.querySelector(\`[data-tab="\${tabName}"]\`).classList.add('active');
        
        // Initialize sortables based on tab
        setTimeout(() => {
            if (tabName === 'media') {
                initializeMediaGridSortable();
            } else if (tabName === 'assignments') {
                if (currentTVId) {
                    initializeAssignmentSortables();
                }
            }
        }, 100);
    }
    
    // Initialize tab click handlers
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const tabName = this.getAttribute('data-tab');
                showTab(tabName);
            });
        });
        
        // Initialize media grid sortable on load
        initializeMediaGridSortable();
    });
    
    // Media grid drag and drop
    function initializeMediaGridSortable() {
        const mediaGrid = document.getElementById('mediaGrid');
        if (!mediaGrid) return;
        
        // Destroy existing sortable
        if (mediaSortable) {
            mediaSortable.destroy();
            mediaSortable = null;
        }
        
        const mediaItems = mediaGrid.querySelectorAll('.media-item[data-id]');
        if (mediaItems.length === 0) return;
        
        mediaSortable = Sortable.create(mediaGrid, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            handle: '.drag-handle',
            filter: 'p',
            onEnd: function(evt) {
                const mediaIds = Array.from(mediaGrid.children)
                    .map(item => item.getAttribute('data-id'))
                    .filter(id => id && !isNaN(parseInt(id)));
                
                if (mediaIds.length > 0) {
                    console.log('Reordering media:', mediaIds);
                    saveMediaOrder(mediaIds);
                }
            }
        });
        
        console.log('✅ Media grid sortable initialized');
    }
    
    // Save media order
    async function saveMediaOrder(mediaIds) {
        try {
            const response = await fetch('/admin/reorder-media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: mediaIds })
            });
            
            const result = await response.json();
            if (result.success) {
                console.log('✅ Media reordered successfully');
            } else {
                console.error('❌ Failed to reorder media:', result.error);
                alert('Failed to reorder media. Please try again.');
            }
        } catch (error) {
            console.error('❌ Error reordering media:', error);
            alert('Error reordering media. Please try again.');
        }
    }
    
    // Assignment tab sortables
    function initializeAssignmentSortables() {
        const availableList = document.getElementById('availableMediaList');
        const assignedList = document.getElementById('assignedMediaList');
        
        if (!availableList || !assignedList) return;
        
        // Destroy existing sortables
        if (availableSortable) {
            availableSortable.destroy();
            availableSortable = null;
        }
        if (assignedSortable) {
            assignedSortable.destroy();
            assignedSortable = null;
        }
        
        // Create new sortables
        availableSortable = Sortable.create(availableList, {
            group: 'assignmentMedia',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onAdd: function(evt) {
                updateItemActions(evt.item, false);
            }
        });
        
        assignedSortable = Sortable.create(assignedList, {
            group: 'assignmentMedia',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onAdd: function(evt) {
                updateItemActions(evt.item, true);
            },
            onEnd: function(evt) {
                if (evt.from === evt.to && currentTVId) {
                    const assignedIds = Array.from(assignedList.children)
                        .map(item => item.getAttribute('data-id'))
                        .filter(id => id && !isNaN(parseInt(id)));
                    
                    if (assignedIds.length > 0) {
                        console.log('Auto-saving reordered assignments:', assignedIds);
                        autoSaveOrder(assignedIds);
                    }
                }
            }
        });
        
        console.log('✅ Assignment sortables initialized');
    }
    
    // Modal assignment sortables
    function initializeModalAssignmentSortables() {
        const modalAvailableList = document.getElementById('modalAvailableMediaList');
        const modalAssignedList = document.getElementById('modalAssignedMediaList');
        
        if (!modalAvailableList || !modalAssignedList) return;
        
        // Destroy existing sortables
        if (modalAvailableSortable) {
            modalAvailableSortable.destroy();
            modalAvailableSortable = null;
        }
        if (modalAssignedSortable) {
            modalAssignedSortable.destroy();
            modalAssignedSortable = null;
        }
        
        // Create new sortables
        modalAvailableSortable = Sortable.create(modalAvailableList, {
            group: 'modalAssignmentMedia',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onAdd: function(evt) {
                updateModalItemActions(evt.item, false);
            }
        });
        
        modalAssignedSortable = Sortable.create(modalAssignedList, {
            group: 'modalAssignmentMedia',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onAdd: function(evt) {
                updateModalItemActions(evt.item, true);
            }
        });
        
        console.log('✅ Modal assignment sortables initialized');
    }
    
    // Auto-save order for assignments tab
    async function autoSaveOrder(mediaIds) {
        if (!currentTVId) return;
        
        try {
          const response = await fetch(\`/api/tv/\${currentTVId}/reorder\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: mediaIds })
            });
            
            const result = await response.json();
            if (result.success) {
                console.log('✅ Order auto-saved successfully');
            } else {
                console.error('❌ Failed to auto-save order:', result.error);
            }
        } catch (error) {
            console.error('❌ Error auto-saving order:', error);
        }
    }
    
    // Load TV media assignment for the assignments tab
    async function loadTVMediaAssignment(tvId) {
        if (!tvId) {
            document.getElementById('assignmentContent').style.display = 'none';
            currentTVId = null;
            return;
        }
        
        currentTVId = tvId;
        
        try {
            console.log('Loading TV media assignment for TV:', tvId);
            const response = await fetch(\`/api/tv/\${tvId}/media\`);
            if (!response.ok) {
                throw new Error("error");
            }
            
            const data = await response.json();
            console.log('Received data:', data);
            
            const availableList = document.getElementById('availableMediaList');
            const assignedList = document.getElementById('assignedMediaList');
            
            // Clear existing content
            availableList.innerHTML = '';
            assignedList.innerHTML = '';
            
            // Populate available media
            const assignedIds = data.assignedMedia.map(am => am.media_id);
            const availableMedia = data.allMedia.filter(m => !assignedIds.includes(m.id));
            
            availableMedia.forEach(media => {
                const item = createMediaAssignmentItem(media, false);
                availableList.appendChild(item);
            });
            
            // Populate assigned media
            const assignedMediaWithOrder = data.assignedMedia
                .map(am => {
                    const mediaItem = data.allMedia.find(m => m.id === am.media_id);
                    if (!mediaItem) return null;
                    return {
                        ...mediaItem,
                        display_order: am.display_order
                    };
                })
                .filter(m => m !== null)
                .sort((a, b) => a.display_order - b.display_order);
            
            assignedMediaWithOrder.forEach(media => {
                const item = createMediaAssignmentItem(media, true);
                assignedList.appendChild(item);
            });
            
            // Initialize sortables
            setTimeout(() => initializeAssignmentSortables(), 100);
            
            document.getElementById('assignmentContent').style.display = 'block';
            console.log(\`✅ Loaded media assignment for TV \${tvId}\`);
            
        } catch (error) {
            console.error('Error loading TV media assignment:', error);
            alert('Error loading media assignment: ' + error.message);
        }
    }
    
    // Create media assignment item
    function createMediaAssignmentItem(media, isAssigned) {
        const item = document.createElement('div');
        item.className = 'media-assignment-item';
        item.setAttribute('data-id', media.id);
        
        const mediaElement = media.file_type === 'image' 
            ? \`<img src="/uploads/\${media.filename}" alt="\${media.original_name}">\`
            : \`<video src="/uploads/\${media.filename}" muted>
                 <source src="/uploads/\${media.filename}" type="video/mp4">
               </video>\`;
        
        item.innerHTML = \`
            <span class="drag-handle-small">⋮⋮</span>
            \${mediaElement}
            <div class="media-assignment-info">
                <strong>\${media.original_name}</strong>
                <small>\${media.file_type.toUpperCase()} - \${(media.file_size/1024/1024).toFixed(2)} MB</small>
            </div>
            <div class="assignment-actions">
                <button onclick="\${isAssigned ? 'removeFromTV' : 'addToTV'}(\${media.id})" 
                        class="btn btn-sm \${isAssigned ? 'btn-danger' : 'btn-success'}">
                    \${isAssigned ? 'Remove' : 'Add'}
                </button>
            </div>
        \`;
        
        return item;
    }
    
    // Create modal media assignment item
    function createModalMediaAssignmentItem(media, isAssigned) {
        const item = document.createElement('div');
        item.className = 'media-assignment-item';
        item.setAttribute('data-id', media.id);
        
        const mediaElement = media.file_type === 'image' 
            ? \`<img src="/uploads/\${media.filename}" alt="\${media.original_name}">\`
            : \`<video src="/uploads/\${media.filename}" muted>
                 <source src="/uploads/\${media.filename}" type="video/mp4">
               </video>\`;
        
        item.innerHTML = \`
            <span class="drag-handle-small">⋮⋮</span>
            \${mediaElement}
            <div class="media-assignment-info">
                <strong>\${media.original_name}</strong>
                <small>\${media.file_type.toUpperCase()} - \${(media.file_size/1024/1024).toFixed(2)} MB</small>
            </div>
            <div class="assignment-actions">
                <button onclick="\${isAssigned ? 'removeFromModalTV' : 'addToModalTV'}(\${media.id})" 
                        class="btn btn-sm \${isAssigned ? 'btn-danger' : 'btn-success'}">
                    \${isAssigned ? 'Remove' : 'Add'}
                </button>
            </div>
        \`;
        
        return item;
    }
    
    // Update item actions for assignments tab
    function updateItemActions(item, isAssigned) {
        const button = item.querySelector('button');
        const mediaId = item.getAttribute('data-id');
        
        if (isAssigned) {
            button.textContent = 'Remove';
            button.className = 'btn btn-sm btn-danger';
            button.setAttribute('onclick', \`removeFromTV(\${mediaId})\`);
        } else {
            button.textContent = 'Add';
            button.className = 'btn btn-sm btn-success';
            button.setAttribute('onclick', \`addToTV(\${mediaId})\`);
        }
    }
    
    // Update item actions for modal
    function updateModalItemActions(item, isAssigned) {
        const button = item.querySelector('button');
        const mediaId = item.getAttribute('data-id');
        
        if (isAssigned) {
            button.textContent = 'Remove';
            button.className = 'btn btn-sm btn-danger';
            button.setAttribute('onclick', \`removeFromModalTV(\${mediaId})\`);
        } else {
            button.textContent = 'Add';
            button.className = 'btn btn-sm btn-success';
            button.setAttribute('onclick', \`addToModalTV(\${mediaId})\`);
        }
    }
    
    // Assignment tab functions
    function addToTV(mediaId) {
        const availableList = document.getElementById('availableMediaList');
        const assignedList = document.getElementById('assignedMediaList');
        const item = availableList.querySelector(\`[data-id="\${mediaId}"]\`);
        
        if (item) {
            assignedList.appendChild(item);
            updateItemActions(item, true);
        }
    }
    
    function removeFromTV(mediaId) {
        const availableList = document.getElementById('availableMediaList');
        const assignedList = document.getElementById('assignedMediaList');
        const item = assignedList.querySelector(\`[data-id="\${mediaId}"]\`);
        
        if (item) {
            availableList.appendChild(item);
            updateItemActions(item, false);
        }
    }
    
    // Modal functions
    function addToModalTV(mediaId) {
        const availableList = document.getElementById('modalAvailableMediaList');
        const assignedList = document.getElementById('modalAssignedMediaList');
        const item = availableList.querySelector(\`[data-id="\${mediaId}"]\`);
        
        if (item) {
            assignedList.appendChild(item);
            updateModalItemActions(item, true);
        }
    }
    
    function removeFromModalTV(mediaId) {
        const availableList = document.getElementById('modalAvailableMediaList');
        const assignedList = document.getElementById('modalAssignedMediaList');
        const item = assignedList.querySelector(\`[data-id="\${mediaId}"]\`);
        
        if (item) {
            availableList.appendChild(item);
            updateModalItemActions(item, false);
        }
    }
    
    // Save assignments for the assignments tab
    async function saveAssignments() {
        if (!currentTVId) {
            alert('Please select a TV first');
            return;
        }
        
        const assignedList = document.getElementById('assignedMediaList');
        const assignments = {};
        
        // Mark all as not assigned first
        const allItems = document.querySelectorAll('#availableMediaList .media-assignment-item, #assignedMediaList .media-assignment-item');
        allItems.forEach(item => {
            assignments[item.getAttribute('data-id')] = false;
        });
        
        // Mark assigned items as assigned with proper order
        Array.from(assignedList.children).forEach((item, index) => {
            const mediaId = item.getAttribute('data-id');
            assignments[mediaId] = { assigned: true, order: index };
        });
        
        try {
            console.log('Saving assignments for TV:', currentTVId, assignments);
            const response = await fetch(\`/api/tv/\${currentTVId}/media\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignments })
            });
            
            const result = await response.json();
            if (result.success) {
                alert(\`Media assignments saved successfully! (\${result.count} items assigned)\`);
            } else {
                alert('Error saving assignments: ' + result.error);
            }
        } catch (error) {
            console.error('Error saving assignments:', error);
            alert('Error saving assignments: ' + error.message);
        }
    }
    
    // Save modal assignments
    async function saveModalAssignments() {
        if (!modalCurrentTVId) {
            alert('No TV selected');
            return;
        }
        
        const assignedList = document.getElementById('modalAssignedMediaList');
        const assignments = {};
        
        // Mark all as not assigned first
        const allItems = document.querySelectorAll('#modalAvailableMediaList .media-assignment-item, #modalAssignedMediaList .media-assignment-item');
        allItems.forEach(item => {
            assignments[item.getAttribute('data-id')] = false;
        });
        
        // Mark assigned items as assigned with proper order
        Array.from(assignedList.children).forEach((item, index) => {
            const mediaId = item.getAttribute('data-id');
            assignments[mediaId] = { assigned: true, order: index };
        });
        
        try {
            console.log('Saving modal assignments for TV:', modalCurrentTVId, assignments);
            const response = await fetch(\`/api/tv/\${modalCurrentTVId}/media\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignments })
            });
            
            const result = await response.json();
            if (result.success) {
                alert(\`Media assignments saved successfully! (\${result.count} items assigned)\`);
                closeMediaAssignmentModal();
                // Refresh the assignments tab if it's the same TV
                if (currentTVId === modalCurrentTVId) {
                    loadTVMediaAssignment(currentTVId);
                }
            } else {
                alert('Error saving assignments: ' + result.error);
            }
        } catch (error) {
            console.error('Error saving modal assignments:', error);
            alert('Error saving assignments: ' + error.message);
        }
    }
    
    // Media assignment modal functions
    async function openMediaAssignmentModal(tvId, tvName) {
        modalCurrentTVId = tvId;
        document.getElementById('mediaAssignmentTitle').textContent = 'Assign Media to ' + tvName;
        document.getElementById('mediaAssignmentModal').style.display = 'block';
        
        // Show loading
        const modalContent = document.getElementById('modalAssignmentContent');
        modalContent.innerHTML = '<div class="loading">Loading media...</div>';
        
        try {
            console.log('Loading modal media assignment for TV:', tvId);
            const response = await fetch(\`/api/tv/\${tvId}/media\`);
            if (!response.ok) {
                throw new Error(\`HTTP error! status: \${response.status}\`);
            }
            
            const data = await response.json();
            console.log('Modal received data:', data);
            
            // Create the assignment interface
            modalContent.innerHTML = \`
                <div class="media-assignment">
                    <div class="available-media">
                        <h4>Available Media</h4>
                        <div id="modalAvailableMediaList" class="media-list"></div>
                    </div>
                    <div class="assigned-media">
                        <h4>Assigned Media (Drag to reorder)</h4>
                        <div id="modalAssignedMediaList" class="media-list"></div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 2rem;">
                    <button onclick="saveModalAssignments()" class="btn btn-primary">Save Media Assignment</button>
                </div>
            \`;
            
            const modalAvailableList = document.getElementById('modalAvailableMediaList');
            const modalAssignedList = document.getElementById('modalAssignedMediaList');
            
            // Populate available media
            const assignedIds = data.assignedMedia.map(am => am.media_id);
            const availableMedia = data.allMedia.filter(m => !assignedIds.includes(m.id));
            
            availableMedia.forEach(media => {
                const item = createModalMediaAssignmentItem(media, false);
                modalAvailableList.appendChild(item);
            });
            
            // Populate assigned media
            const assignedMediaWithOrder = data.assignedMedia
                .map(am => {
                    const mediaItem = data.allMedia.find(m => m.id === am.media_id);
                    if (!mediaItem) return null;
                    return {
                        ...mediaItem,
                        display_order: am.display_order
                    };
                })
                .filter(m => m !== null)
                .sort((a, b) => a.display_order - b.display_order);
            
            assignedMediaWithOrder.forEach(media => {
                const item = createModalMediaAssignmentItem(media, true);
                modalAssignedList.appendChild(item);
            });
            
            // Initialize modal sortables
            setTimeout(() => initializeModalAssignmentSortables(), 100);
            
            console.log(\`✅ Loaded modal media assignment for TV \${tvId}\`);
            
        } catch (error) {
            console.error('Error loading modal media assignment:', error);
            modalContent.innerHTML = \`<div class="error">Error loading media assignment: \${error.message}</div>\`;
        }
    }
    
    function closeMediaAssignmentModal() {
        document.getElementById('mediaAssignmentModal').style.display = 'none';
        modalCurrentTVId = null;
        
        // Destroy modal sortables
        if (modalAvailableSortable) {
            modalAvailableSortable.destroy();
            modalAvailableSortable = null;
        }
        if (modalAssignedSortable) {
            modalAssignedSortable.destroy();
            modalAssignedSortable = null;
        }
    }
    
    // Station modal functions
    function openStationModal() {
        document.getElementById('stationModalTitle').textContent = 'Add Gas Station';
        document.getElementById('stationForm').action = '/admin/stations';
        document.getElementById('stationId').value = '';
        document.getElementById('stationName').value = '';
        document.getElementById('stationLocation').value = '';
        document.getElementById('stationModal').style.display = 'block';
    }
    
    function closeStationModal() {
        document.getElementById('stationModal').style.display = 'none';
    }
    
    function editStation(id, name, location) {
        document.getElementById('stationModalTitle').textContent = 'Edit Gas Station';
        document.getElementById('stationForm').action = '/admin/stations/' + id;
        document.getElementById('stationId').value = id;
        document.getElementById('stationName').value = name;
        document.getElementById('stationLocation').value = location || '';
        document.getElementById('stationModal').style.display = 'block';
    }
    
    function deleteStation(id) {
        if (confirm('Are you sure you want to delete this gas station and all its TVs?')) {
            fetch('/admin/stations/' + id, { method: 'DELETE' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert('Error deleting station: ' + data.error);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('Error deleting station');
                });
        }
    }
    
    // TV modal functions
    function openTVModal() {
        document.getElementById('tvModalTitle').textContent = 'Add TV';
        document.getElementById('tvForm').action = '/admin/tvs';
        document.getElementById('tvId').value = '';
        document.getElementById('tvName').value = '';
        document.getElementById('tvTiming').value = '5';
        document.getElementById('tvModal').style.display = 'block';
    }
    
    function closeTVModal() {
        document.getElementById('tvModal').style.display = 'none';
    }
    
    function editTV(id, name, stationId, timing) {
        document.getElementById('tvModalTitle').textContent = 'Edit TV';
        document.getElementById('tvForm').action = '/admin/tvs/' + id;
        document.getElementById('tvId').value = id;
        document.getElementById('tvName').value = name;
        document.getElementById('tvStation').value = stationId;
        document.getElementById('tvTiming').value = timing / 1000;
        document.getElementById('tvModal').style.display = 'block';
    }
    
    function deleteTV(id) {
        if (confirm('Are you sure you want to delete this TV?')) {
            fetch('/admin/tvs/' + id, { method: 'DELETE' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert('Error deleting TV: ' + data.error);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('Error deleting TV');
                });
        }
    }
    
    // Media functions
    function viewMedia(filename, type, originalName) {
        window.open('/uploads/' + filename, '_blank');
    }
    
    function deleteMedia(id, name) {
        if (confirm('Are you sure you want to delete "' + name + '"?')) {
            fetch('/admin/media/' + id, { method: 'DELETE' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert('Error deleting media: ' + data.error);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('Error deleting media');
                });
        }
    }
    
    // Close modals when clicking outside
    window.onclick = function(event) {
        const modals = ['stationModal', 'tvModal', 'mediaAssignmentModal'];
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (event.target === modal) {
                if (modalId === 'mediaAssignmentModal') {
                    closeMediaAssignmentModal();
                } else {
                    modal.style.display = 'none';
                }
            }
        });
    }
    
    // Window resize handler
    window.addEventListener('resize', function() {
        setTimeout(() => {
            if (document.getElementById('mediaGrid')) {
                initializeMediaGridSortable();
            }
            if (currentTVId) {
                initializeAssignmentSortables();
            }
            if (modalCurrentTVId) {
                initializeModalAssignmentSortables();
            }
        }, 300);
    });
</script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Fixed TV display route - Replace the existing /tv/:tvId route in server.js

app.get("/tv/:tvId", async (req, res) => {
  try {
    const tvId = req.params.tvId;

    // Get TV details and settings
    const tvResult = await pool.query(
      `
      SELECT t.*, gs.name as station_name 
      FROM tvs t 
      JOIN gas_stations gs ON t.gas_station_id = gs.id 
      WHERE t.id = $1
    `,
      [tvId]
    );

    if (tvResult.rows.length === 0) {
      return res.status(404).send("TV not found");
    }

    const tv = tvResult.rows[0];

    // Get active media for this TV ordered by display_order
    const mediaResult = await pool.query(
      `
      SELECT m.*, tm.display_order as tv_order 
      FROM media m 
      JOIN tv_media tm ON m.id = tm.media_id 
      WHERE tm.tv_id = $1 AND tm.is_active = true 
      ORDER BY tm.display_order ASC, m.upload_date DESC
    `,
      [tvId]
    );

    const media = mediaResult.rows;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Gas Station TV - ${tv.name}</title>
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
                  flex-direction: column;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  color: white;
                  font-size: 24px;
                  text-align: center;
              }
              
              .tv-control-btn {
                  position: fixed;
                  top: 20px;
                  right: 20px;
                  width: 50px;
                  height: 50px;
                  background: rgba(255, 255, 255, 0.1);
                  border: none;
                  border-radius: 50%;
                  cursor: pointer;
                  opacity: 0;
                  transition: opacity 0.3s;
                  z-index: 1000;
                  color: white;
                  font-size: 20px;
              }
              
              .tv-control-btn:hover {
                  opacity: 1;
                  background: rgba(255, 255, 255, 0.3);
              }
              
              .modal {
                  display: none;
                  position: fixed;
                  z-index: 2000;
                  left: 0;
                  top: 0;
                  width: 100%;
                  height: 100%;
                  background-color: rgba(0,0,0,0.9);
              }
              
              .modal-content {
                  background-color: #fefefe;
                  margin: 2% auto;
                  padding: 20px;
                  border-radius: 10px;
                  width: 95%;
                  max-width: 1000px;
                  max-height: 90vh;
                  overflow-y: auto;
              }
              
              .close {
                  color: #aaa;
                  float: right;
                  font-size: 28px;
                  font-weight: bold;
                  cursor: pointer;
              }
              
              .close:hover {
                  color: black;
              }
              
              .auth-section {
                  margin-bottom: 20px;
                  padding: 20px;
                  border: 1px solid #ddd;
                  border-radius: 5px;
              }
              
              .media-selection {
                  display: none;
              }
              
              .media-assignment {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 2rem;
                  margin-top: 1rem;
              }
              
              .available-media,
              .assigned-media {
                  border: 1px solid #ddd;
                  border-radius: 8px;
                  padding: 1rem;
                  min-height: 400px;
              }
              
              .available-media h4,
              .assigned-media h4 {
                  margin-top: 0;
                  padding-bottom: 0.5rem;
                  border-bottom: 1px solid #eee;
              }
              
              .media-list {
                  max-height: 400px;
                  overflow-y: auto;
              }
              
              .media-assignment-item {
                  display: flex;
                  align-items: center;
                  padding: 0.5rem;
                  border: 1px solid #ddd;
                  margin: 0.25rem 0;
                  border-radius: 5px;
                  cursor: move;
                  background: white;
                  transition: background 0.2s;
              }
              
              .media-assignment-item:hover {
                  background: #f8f9fa;
              }
              
              .media-assignment-item.sortable-ghost {
                  opacity: 0.4;
              }
              
              .media-assignment-item.sortable-chosen {
                  background: #e3f2fd;
              }
              
              .media-assignment-item img,
              .media-assignment-item video {
                  width: 60px;
                  height: 40px;
                  object-fit: cover;
                  margin-right: 1rem;
                  border-radius: 3px;
              }
              
              .media-assignment-info {
                  flex: 1;
              }
              
              .media-assignment-info strong {
                  display: block;
                  font-size: 0.9rem;
              }
              
              .media-assignment-info small {
                  color: #666;
                  font-size: 0.8rem;
              }
              
              .assignment-actions {
                  display: flex;
                  gap: 0.25rem;
              }
              
              .btn {
                  padding: 0.25rem 0.5rem;
                  border: none;
                  border-radius: 3px;
                  cursor: pointer;
                  font-size: 0.8rem;
                  transition: background 0.2s;
              }
              
              .btn-success {
                  background: #28a745;
                  color: white;
              }
              
              .btn-success:hover {
                  background: #218838;
              }
              
              .btn-danger {
                  background: #dc3545;
                  color: white;
              }
              
              .btn-danger:hover {
                  background: #c82333;
              }
              
              .btn-primary {
                  background: #007bff;
                  color: white;
              }
              
              .btn-primary:hover {
                  background: #0056b3;
              }
              
              .timing-section {
                  margin: 20px 0;
                  padding: 15px;
                  border: 1px solid #ddd;
                  border-radius: 5px;
                  background: #f8f9fa;
              }
              
              .timing-input {
                  width: 100px;
                  padding: 5px;
                  margin: 0 10px;
                  border: 1px solid #ddd;
                  border-radius: 3px;
              }
              
              input[type="password"] {
                  width: 100%;
                  max-width: 300px;
                  padding: 0.5rem;
                  border: 1px solid #ddd;
                  border-radius: 5px;
                  margin: 0.5rem 0;
              }
              
              .auth-error {
                  color: red;
                  margin-top: 10px;
                  display: none;
              }
              
              .drag-handle {
                  margin-right: 0.5rem;
                  color: #666;
                  cursor: grab;
              }
              
              .drag-handle:active {
                  cursor: grabbing;
              }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
      </head>
      <body>
          <button class="tv-control-btn" onclick="openControlModal()">⚙</button>
          
          ${
            media.length === 0
              ? `<div class="no-media">
                   <div>No media assigned to this TV</div>
                   <div style="font-size: 16px; margin-top: 20px; color: #ccc;">
                     ${tv.name} - ${tv.station_name}
                   </div>
                 </div>`
              : `<div class="carousel-container">
                ${media
                  .map(
                    (item, index) => `
                    <div class="carousel-item ${
                      index === 0 ? "active" : ""
                    }" data-type="${item.file_type}" data-id="${item.id}">
                        ${
                          item.file_type === "image"
                            ? `<img src="/uploads/${item.filename}" alt="${item.original_name}">`
                            : `<video autoplay muted playsinline preload="auto" crossorigin="anonymous">
                                <source src="/uploads/${item.filename}" type="video/${item.filename.split(".").pop()}">
                                Your browser does not support the video tag.
                              </video>`
                        }
                    </div>
                `
                  )
                  .join("")}
            </div>`
          }
          
          <!-- Control Modal -->
          <div id="controlModal" class="modal">
              <div class="modal-content">
                  <span class="close" onclick="closeControlModal()">&times;</span>
                  <h2>TV Control Panel - ${tv.name}</h2>
                  <p><strong>Station:</strong> ${tv.station_name}</p>
                  
                  <div class="auth-section" id="authSection">
                      <h3>Admin Authentication Required</h3>
                      <input type="password" id="adminPassword" placeholder="Enter admin password">
                      <button onclick="authenticate()" class="btn btn-primary">Authenticate</button>
                      <div id="authError" class="auth-error">Invalid password</div>
                  </div>
                  
                  <div class="media-selection" id="mediaSelection">
                      <div class="timing-section">
                          <h3>Image Transition Time</h3>
                          <label>
                              Time (seconds): 
                              <input type="number" id="transitionTime" class="timing-input" 
                                     value="${
                                       tv.image_transition_time / 1000
                                     }" min="1" max="60">
                          </label>
                          <button onclick="updateTiming()" class="btn btn-primary">Update Timing</button>
                      </div>
                      
                      <h3>Media Assignment & Ordering</h3>
                      <p style="color: #666; font-size: 0.9rem; margin-bottom: 1rem;">
                          Drag media between lists to assign/unassign. Drag within "Assigned Media" to reorder.
                      </p>
                      
                      <div class="media-assignment">
                          <div class="available-media">
                              <h4>Available Media</h4>
                              <div id="availableMediaList" class="media-list"></div>
                          </div>
                          <div class="assigned-media">
                              <h4>Assigned Media (Drag to reorder)</h4>
                              <div id="assignedMediaList" class="media-list"></div>
                          </div>
                      </div>
                      
                      <div style="text-align: center; margin-top: 2rem;">
                          <button onclick="saveMediaSelection()" class="btn btn-primary">Save Changes & Reload</button>
                      </div>
                  </div>
              </div>
          </div>
          
          <script>
              const items = document.querySelectorAll('.carousel-item');
              let currentIndex = 0;
              let transitionTime = ${tv.image_transition_time};
              let mediaAssignments = {};
              let availableSortable = null;
              let assignedSortable = null;
              let carouselTimer = null;
              let userHasInteracted = false;

              function stopAllVideosExcept(exceptIndex = -1) {
                items.forEach((item, index) => {
                    if (index !== exceptIndex && item.dataset.type === 'video') {
                        const video = item.querySelector('video');
                        if (video) {
                            video.pause();
                            video.currentTime = 0;
                        }
                    }
                });
            }
              
            function prepareVideo(video) {
              return new Promise((resolve, reject) => {
                  // First ensure video is stopped
                  video.pause();
                  video.currentTime = 0;
                  
                  // Remove any existing event listeners
                  video.onloadeddata = null;
                  video.oncanplay = null;
                  video.onerror = null;
                  
                  const handleCanPlay = () => {
                      video.oncanplay = null;
                      video.onerror = null;
                      resolve();
                  };
                  
                  const handleError = () => {
                      video.oncanplay = null;
                      video.onerror = null;
                      reject(new Error('Video failed to load'));
                  };
                  
                  video.oncanplay = handleCanPlay;
                  video.onerror = handleError;
                  
                  // Force reload
                  // video.load();
                  
                  // Timeout fallback
                  setTimeout(() => {
                      video.oncanplay = null;
                      video.onerror = null;
                      resolve(); // Resolve anyway to continue carousel
                  }, 5000);
              });
          }
              function forceVideoLoad(video) {
                return new Promise((resolve, reject) => {
                  video.pause();
                  video.currentTime = 0;
                  video.load(); // always reload the element
              
                  const handleCanPlay = () => {
                    video.removeEventListener('canplay', handleCanPlay);
                    video.removeEventListener('error', handleError);
                    resolve();
                  };
              
                  const handleError = () => {
                    video.removeEventListener('canplay', handleCanPlay);
                    video.removeEventListener('error', handleError);
                    reject(new Error('Video failed to load'));
                  };
              
                  video.addEventListener('canplay', handleCanPlay);
                  video.addEventListener('error', handleError);
              
                  setTimeout(() => {
                    video.removeEventListener('canplay', handleCanPlay);
                    video.removeEventListener('error', handleError);
                    reject(new Error('Video load timeout'));
                  }, 5000);
                });
              }
              
              
              async function playVideo(video) {
                try {
                    await prepareVideo(video);
                    
                    // Try to play with sound if user has interacted
                    if (userHasInteracted) {
                        video.muted = false;
                    } else {
                        video.muted = true;
                    }
                    
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                        await playPromise;
                        return true;
                    }
                    return true;
                } catch (error) {
                    console.warn('Video play failed:', error);
                    
                    // Fallback to muted play
                    try {
                        video.muted = true;
                        await video.play();
                        return true;
                    } catch (mutedError) {
                        console.error('Even muted play failed:', mutedError);
                        return false;
                    }
                }
            }    
              
            function startCarousel() {
              if (items.length === 0) return;
              
              async function showNextItem() {
                  // Clear any existing timer
                  if (carouselTimer) {
                      clearTimeout(carouselTimer);
                      carouselTimer = null;
                  }
                  
                  // Stop all videos before switching
                  stopAllVideosExcept(-1);
                  
                  // Switch to next item
                  if (items.length > 1) {
                      items[currentIndex].classList.remove('active');
                      currentIndex = (currentIndex + 1) % items.length;
                      items[currentIndex].classList.add('active');
                  }
                  
                  const currentItem = items[currentIndex];
                  const isVideo = currentItem.dataset.type === 'video';
                  
                  if (isVideo) {
                      const video = currentItem.querySelector('video');
                      if (video) {
                          const playSuccess = await playVideo(video);
                          
                          if (playSuccess) {
                              // Set up end handler for this specific video
                              video.onended = () => {
                                  if (items.length > 1) {
                                      showNextItem();
                                  } else {
                                      // Single video loop
                                      video.currentTime = 0;
                                      playVideo(video);
                                  }
                              };
                          } else {
                              // If video fails, move to next after delay
                              if (items.length > 1) {
                                  carouselTimer = setTimeout(showNextItem, 3000);
                              }
                          }
                      }
                  } else {
                      // Image - set timer for next item
                      if (items.length > 1) {
                          carouselTimer = setTimeout(showNextItem, transitionTime);
                      }
                  }
              }
  
              async function initializeCarousel() {
                // Ensure all videos are stopped initially
                stopAllVideosExcept(0);
                
                const firstItem = items[0];
                if (firstItem.dataset.type === 'video') {
                    const video = firstItem.querySelector('video');
                    if (video) {
                        const playSuccess = await playVideo(video);
                        if (playSuccess) {
                            video.onended = () => {
                                if (items.length > 1) {
                                    showNextItem();
                                } else {
                                    video.currentTime = 0;
                                    playVideo(video);
                                }
                            };
                        } else if (items.length > 1) {
                            carouselTimer = setTimeout(showNextItem, 3000);
                        }
                    }
                } else if (items.length > 1) {
                    carouselTimer = setTimeout(showNextItem, transitionTime);
                }
            }
            
            initializeCarousel();
        }

        function handleUserInteraction() {
          if (!userHasInteracted) {
              userHasInteracted = true;
              localStorage.setItem("videoSoundAllowed", "true");
              
              // If current item is a video, unmute it
              const currentItem = items[currentIndex];
              if (currentItem && currentItem.dataset.type === 'video') {
                  const video = currentItem.querySelector('video');
                  if (video && !video.paused) {
                      video.muted = false;
                  }
              }
          }
      }

      document.addEventListener('click', handleUserInteraction);
        document.addEventListener('keydown', handleUserInteraction);
        document.addEventListener('touchstart', handleUserInteraction);

        if (localStorage.getItem("videoSoundAllowed") === "true") {
          userHasInteracted = true;
      }

              
              function openControlModal() {
                  document.getElementById('controlModal').style.display = 'block';
              }
              
              function closeControlModal() {
                  document.getElementById('controlModal').style.display = 'none';
                  document.getElementById('authSection').style.display = 'block';
                  document.getElementById('mediaSelection').style.display = 'none';
                  document.getElementById('adminPassword').value = '';
                  document.getElementById('authError').style.display = 'none';
              }
              
              async function authenticate() {
                  const password = document.getElementById('adminPassword').value;
                  try {
                      const response = await fetch('/api/authenticate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ password })
                      });
                      
                      const result = await response.json();
                      if (result.success) {
                          document.getElementById('authSection').style.display = 'none';
                          document.getElementById('mediaSelection').style.display = 'block';
                          await loadMediaList();
                      } else {
                          document.getElementById('authError').style.display = 'block';
                      }
                  } catch (error) {
                      console.error('Authentication error:', error);
                  }
              }
              
              async function loadMediaList() {
                  try {
                      const response = await fetch('/api/tv/${tvId}/media');
                      const data = await response.json();
                      
                      const availableList = document.getElementById('availableMediaList');
                      const assignedList = document.getElementById('assignedMediaList');
                      
                      availableList.innerHTML = '';
                      assignedList.innerHTML = '';
                      
                      const assignedIds = data.assignedMedia.map(am => am.media_id);
                      
                      const availableMedia = data.allMedia.filter(m => !assignedIds.includes(m.id));
                      availableMedia.forEach(media => {
                          const item = createMediaAssignmentItem(media, false);
                          availableList.appendChild(item);
                      });
                      
                      const assignedMediaWithOrder = data.assignedMedia
                          .map(am => ({
                              ...data.allMedia.find(m => m.id === am.media_id),
                              display_order: am.display_order
                          }))
                          .filter(m => m && m.id) 
                          .sort((a, b) => a.display_order - b.display_order);
                      
                      assignedMediaWithOrder.forEach(media => {
                          const item = createMediaAssignmentItem(media, true);
                          assignedList.appendChild(item);
                      });
                      
                      initializeSortable();
                      
                  } catch (error) {
                      console.error('Error loading media list:', error);
                  }
              }
              
              function createMediaAssignmentItem(media, isAssigned) {
                  const item = document.createElement('div');
                  item.className = 'media-assignment-item';
                  item.setAttribute('data-id', media.id);
                  
                  const mediaElement = media.file_type === 'image' 
                      ? \`<img src="/uploads/\${media.filename}" alt="\${media.original_name}">\`
                      : \`<video src="/uploads/\${media.filename}" muted>
                           <source src="/uploads/\${media.filename}" type="video/\${media.filename.split('.').pop()}">
                         </video>\`;
                  
                  item.innerHTML = \`
                      <span class="drag-handle">⋮⋮</span>
                      \${mediaElement}
                      <div class="media-assignment-info">
                          <strong>\${media.original_name}</strong>
                          <small>\${media.file_type.toUpperCase()} - \${(media.file_size/1024/1024).toFixed(2)} MB</small>
                      </div>
                      <div class="assignment-actions">
                          <button onclick="\${isAssigned ? 'removeFromTV' : 'addToTV'}(\${media.id})" 
                                  class="btn \${isAssigned ? 'btn-danger' : 'btn-success'}">
                              \${isAssigned ? 'Remove' : 'Add'}
                          </button>
                      </div>
                  \`;
                  
                  return item;
              }
              
              function initializeSortable() {
                  const availableList = document.getElementById('availableMediaList');
                  const assignedList = document.getElementById('assignedMediaList');
                  
                  if (availableSortable) {
                      availableSortable.destroy();
                      availableSortable = null;
                  }
                  if (assignedSortable) {
                      assignedSortable.destroy();
                      assignedSortable = null;
                  }
                  
                  availableSortable = Sortable.create(availableList, {
                      group: 'tvMedia',
                      animation: 150,
                      ghostClass: 'sortable-ghost',
                      chosenClass: 'sortable-chosen',
                      handle: '.drag-handle',
                      onAdd: function(evt) {
                          updateItemActions(evt.item, false);
                      }
                  });
                  
                  assignedSortable = Sortable.create(assignedList, {
                      group: 'tvMedia',
                      animation: 150,
                      ghostClass: 'sortable-ghost',
                      chosenClass: 'sortable-chosen',
                      handle: '.drag-handle',
                      onAdd: function(evt) {
                          updateItemActions(evt.item, true);
                      },
                      onEnd: function(evt) {
                          if (evt.from === evt.to) {
                              console.log('Reordered within assigned list');
                          }
                      }
                  });
              }
              
              function updateItemActions(item, isAssigned) {
                  const button = item.querySelector('button');
                  const mediaId = item.getAttribute('data-id');
                  
                  if (isAssigned) {
                      button.textContent = 'Remove';
                      button.className = 'btn btn-danger';
                      button.setAttribute('onclick', \`removeFromTV(\${mediaId})\`);
                  } else {
                      button.textContent = 'Add';
                      button.className = 'btn btn-success';
                      button.setAttribute('onclick', \`addToTV(\${mediaId})\`);
                  }
              }
              
              function addToTV(mediaId) {
                  const availableList = document.getElementById('availableMediaList');
                  const assignedList = document.getElementById('assignedMediaList');
                  const item = availableList.querySelector(\`[data-id="\${mediaId}"]\`);
                  
                  if (item) {
                      assignedList.appendChild(item);
                      updateItemActions(item, true);
                  }
              }
              
              function removeFromTV(mediaId) {
                  const availableList = document.getElementById('availableMediaList');
                  const assignedList = document.getElementById('assignedMediaList');
                  const item = assignedList.querySelector(\`[data-id="\${mediaId}"]\`);
                  
                  if (item) {
                      availableList.appendChild(item);
                      updateItemActions(item, false);
                  }
              }
              
              async function saveMediaSelection() {
                  const assignedList = document.getElementById('assignedMediaList');
                  const assignments = {};
                  
                  const allItems = document.querySelectorAll('.media-assignment-item');
                  allItems.forEach(item => {
                      assignments[item.getAttribute('data-id')] = false;
                  });
                  
                  Array.from(assignedList.children).forEach((item, index) => {
                      const mediaId = item.getAttribute('data-id');
                      assignments[mediaId] = { assigned: true, order: index };
                  });
                  
                  try {
                      const response = await fetch('/api/tv/${tvId}/media', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ assignments })
                      });
                      
                      if (response.ok) {
                          alert('Media assignments saved! Page will reload to show changes.');
                          location.reload();
                      } else {
                          alert('Error saving media assignments');
                      }
                  } catch (error) {
                      console.error('Error saving media selection:', error);
                      alert('Error saving media assignments');
                  }
              }
              
              async function updateTiming() {
                  const newTime = document.getElementById('transitionTime').value * 1000;
                  try {
                      const response = await fetch('/api/tv/${tvId}/timing', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ transitionTime: newTime })
                      });
                      
                      if (response.ok) {
                          transitionTime = newTime;
                          alert('Timing updated!');
                      } else {
                          alert('Error updating timing');
                      }
                  } catch (error) {
                      console.error('Error updating timing:', error);
                      alert('Error updating timing');
                  }
              }
              
              window.onclick = function(event) {
                  const modal = document.getElementById('controlModal');
                  if (event.target === modal) {
                      closeControlModal();
                  }
              }

              document.addEventListener("DOMContentLoaded", () => {
                const videos = document.querySelectorAll("video");
              
                // Agar oldin ruxsat berilgan bo'lsa, darhol ovozni yoqamiz
                if (localStorage.getItem("videoSoundAllowed") === "true") {
                  videos.forEach(video => {
                    video.muted = false;
                    video.play().catch(err => console.warn("Autoplay with sound failed:", err));
                  });
                } else {
                  // Avval muted holda autoplay
                  videos.forEach(video => {
                    video.muted = true;
                    video.play().catch(err => console.warn("Muted autoplay failed:", err));
                  });
              
                  // Birinchi user interaction bo'lganda ovoz yoqiladi
                  const enableSound = () => {
                    videos.forEach(video => {
                      video.muted = false;
                      video.play().catch(err => console.warn("Play with sound failed:", err));
                    });
                    localStorage.setItem("videoSoundAllowed", "true");
                    document.removeEventListener("click", enableSound);
                    document.removeEventListener("keydown", enableSound);
                  };
              
                  document.addEventListener("click", enableSound);
                  document.addEventListener("keydown", enableSound);
                }
              });
              
              window.addEventListener("load", () => {
                const currentItem = items[currentIndex];
                if (currentItem.dataset.type === "video") {
                  const video = currentItem.querySelector("video");
                  if (video) {
                    video.play().catch(err => console.warn("Video play failed after reload:", err));
                  }
                }
              });
                     
              document.addEventListener("click", () => {
                const videos = document.querySelectorAll("video");
                videos.forEach(video => {
                  video.muted = false;
                  video.play().catch(err => console.warn("Play with sound failed:", err));
                });
              }, { once: true });
              
              
              document.addEventListener('DOMContentLoaded', function() {
                // Small delay to ensure everything is loaded
                setTimeout(() => {
                    startCarousel();
                }, 500);
            });
              
            document.addEventListener('error', function(e) {
              if (e.target.tagName === 'VIDEO') {
                  console.error('Video error:', e.target.src);
                  // If it's the current video, try to move to next item
                  const currentItem = items[currentIndex];
                  if (currentItem && currentItem.querySelector('video') === e.target) {
                      if (items.length > 1) {
                          setTimeout(() => {
                              items[currentIndex].classList.remove('active');
                              currentIndex = (currentIndex + 1) % items.length;
                              items[currentIndex].classList.add('active');
                              startCarousel();
                          }, 1000);
                      }
                  }
              }
          }, true);
              
              document.addEventListener('visibilitychange', function() {
                if (document.hidden) {
                    // Page hidden - pause current video
                    const currentItem = items[currentIndex];
                    if (currentItem && currentItem.dataset.type === 'video') {
                        const video = currentItem.querySelector('video');
                        if (video) {
                            video.pause();
                        }
                    }
                } else {
                    // Page visible - resume current video
                    const currentItem = items[currentIndex];
                    if (currentItem && currentItem.dataset.type === 'video') {
                        const video = currentItem.querySelector('video');
                        if (video && video.paused) {
                            playVideo(video);
                        }
                    }
                }
            });
          </script>
          
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Error fetching TV media:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API Routes

// Default route redirects to admin
app.get("/", (req, res) => {
  res.redirect("/admin");
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
            * { box-sizing: border-box; padding: 0; margin: 0; }
            body {
                font-family: Arial, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                height: 100vh;
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
            h1 { text-align: center; color: #333; margin-bottom: 2rem; }
            .form-group { margin-bottom: 1rem; }
            label { display: block; margin-bottom: 0.5rem; color: #555; font-weight: bold; }
            input[type="text"], input[type="password"] {
                width: 100%;
                padding: 0.75rem;
                border: 2px solid #ddd;
                border-radius: 5px;
                font-size: 1rem;
                transition: border-color 0.3s;
            }
            input[type="text"]:focus, input[type="password"]:focus {
                outline: none;
                border-color: #667eea;
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
            button:hover { background: #5a6fd8; }
            .error { color: #dc3545; text-align: center; margin-top: 1rem; }
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
            <h1>Gas Station Admin</h1>
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
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit">Login</button>
                ${
                  req.query.error
                    ? '<div class="error">Invalid credentials</div>'
                    : ""
                }
            </form>
        </div>
    </body>
    </html>
  `);
});

// Admin login POST
app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query(
      "SELECT * FROM admins WHERE username = $1",
      [username]
    );

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

// Remaining server routes - add these to the main server.js file

// Gas Station Routes
app.post("/admin/stations", requireAuth, async (req, res) => {
  try {
    const { name, location } = req.body;
    await pool.query(
      "INSERT INTO gas_stations (name, location) VALUES ($1, $2)",
      [name, location || null]
    );
    res.redirect("/admin");
  } catch (err) {
    console.error("Error creating gas station:", err);
    res.redirect("/admin?error=station_create_failed");
  }
});

app.post("/admin/stations/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location } = req.body;
    await pool.query(
      "UPDATE gas_stations SET name = $1, location = $2 WHERE id = $3",
      [name, location || null, id]
    );
    res.redirect("/admin");
  } catch (err) {
    console.error("Error updating gas station:", err);
    res.redirect("/admin?error=station_update_failed");
  }
});

app.delete("/admin/stations/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM gas_stations WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting gas station:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// TV Routes
app.post("/admin/tvs", requireAuth, async (req, res) => {
  try {
    const { name, gas_station_id, image_transition_time } = req.body;
    const timingMs = parseInt(image_transition_time) * 1000;

    await pool.query(
      "INSERT INTO tvs (name, gas_station_id, image_transition_time) VALUES ($1, $2, $3)",
      [name, gas_station_id, timingMs]
    );
    res.redirect("/admin");
  } catch (err) {
    console.error("Error creating TV:", err);
    res.redirect("/admin?error=tv_create_failed");
  }
});

app.post("/admin/tvs/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, gas_station_id, image_transition_time } = req.body;
    const timingMs = parseInt(image_transition_time) * 1000;

    await pool.query(
      "UPDATE tvs SET name = $1, gas_station_id = $2, image_transition_time = $3 WHERE id = $4",
      [name, gas_station_id, timingMs, id]
    );
    res.redirect("/admin");
  } catch (err) {
    console.error("Error updating TV:", err);
    res.redirect("/admin?error=tv_update_failed");
  }
});

app.delete("/admin/tvs/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM tvs WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting TV:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Additional server routes - Add these to your server.js file

// Fixed API routes - Replace the existing API routes in server.js

// Enhanced TV media assignment API route with proper ordering
app.post("/api/tv/:tvId/media", async (req, res) => {
  try {
    const tvId = req.params.tvId;
    const { assignments } = req.body;

    console.log("Received assignments for TV", tvId, ":", assignments);

    // Start transaction
    await pool.query("BEGIN");

    try {
      // Delete existing assignments for this TV
      await pool.query("DELETE FROM tv_media WHERE tv_id = $1", [tvId]);

      // Process assignments - handle both old and new format
      const mediaToAssign = [];

      for (const [mediaId, assignment] of Object.entries(assignments)) {
        if (assignment === true) {
          // Old format: simple boolean
          mediaToAssign.push({
            mediaId: parseInt(mediaId),
            order: mediaToAssign.length,
          });
        } else if (assignment && assignment.assigned === true) {
          // New format: object with assigned and order
          mediaToAssign.push({
            mediaId: parseInt(mediaId),
            order:
              assignment.order !== undefined
                ? assignment.order
                : mediaToAssign.length,
          });
        }
      }

      // Sort by order to ensure correct insertion
      mediaToAssign.sort((a, b) => a.order - b.order);

      // Insert new assignments with proper ordering
      for (let i = 0; i < mediaToAssign.length; i++) {
        const { mediaId } = mediaToAssign[i];
        await pool.query(
          "INSERT INTO tv_media (tv_id, media_id, is_active, display_order) VALUES ($1, $2, $3, $4)",
          [tvId, mediaId, true, i]
        );
      }

      // Commit transaction
      await pool.query("COMMIT");

      console.log(
        `✅ Successfully updated TV ${tvId} with ${mediaToAssign.length} media assignments`
      );
      res.json({ success: true, count: mediaToAssign.length });
    } catch (err) {
      // Rollback transaction on error
      await pool.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("Error updating TV media:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// Enhanced media reordering route for admin panel
app.post("/admin/reorder-media", requireAuth, async (req, res) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.json({ success: false, error: "Invalid order data" });
    }

    console.log("Reordering media:", order);

    // Start transaction
    await pool.query("BEGIN");

    try {
      // Update display_order for each media item
      for (let i = 0; i < order.length; i++) {
        const mediaId = parseInt(order[i]);
        if (isNaN(mediaId)) continue;

        await pool.query("UPDATE media SET display_order = $1 WHERE id = $2", [
          i,
          mediaId,
        ]);
      }

      await pool.query("COMMIT");
      console.log(`✅ Successfully reordered ${order.length} media items`);
      res.json({ success: true });
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("Media reorder error:", err);
    res.json({ success: false, error: "Database error", details: err.message });
  }
});

// Enhanced TV media reordering for assignment lists
app.post("/api/tv/:tvId/reorder", requireAuth, async (req, res) => {
  try {
    const tvId = req.params.tvId;
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.json({ success: false, error: "Invalid order data" });
    }

    console.log(`Reordering TV ${tvId} media:`, order);

    // Start transaction
    await pool.query("BEGIN");

    try {
      // Update display_order for each TV media assignment
      for (let i = 0; i < order.length; i++) {
        const mediaId = parseInt(order[i]);
        if (isNaN(mediaId)) continue;

        await pool.query(
          "UPDATE tv_media SET display_order = $1 WHERE tv_id = $2 AND media_id = $3",
          [i, tvId, mediaId]
        );
      }

      await pool.query("COMMIT");
      console.log(
        `✅ Successfully reordered ${order.length} TV media assignments`
      );
      res.json({ success: true });
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("TV media reorder error:", err);
    res.json({ success: false, error: "Database error", details: err.message });
  }
});

// Enhanced TV media API route with better error handling
app.get("/api/tv/:tvId/media", async (req, res) => {
  try {
    const tvId = req.params.tvId;

    // Verify TV exists
    const tvCheck = await pool.query("SELECT id FROM tvs WHERE id = $1", [
      tvId,
    ]);
    if (tvCheck.rows.length === 0) {
      return res.status(404).json({ error: "TV not found" });
    }

    const allMediaResult = await pool.query(`
      SELECT * FROM media 
      ORDER BY display_order ASC, original_name ASC
    `);

    const assignedMediaResult = await pool.query(
      `
      SELECT tm.media_id, tm.display_order, tm.is_active,
             m.filename, m.original_name, m.file_type, m.file_size, m.upload_date
      FROM tv_media tm
      JOIN media m ON tm.media_id = m.id
      WHERE tm.tv_id = $1 AND tm.is_active = true
      ORDER BY tm.display_order ASC
    `,
      [tvId]
    );

    res.json({
      allMedia: allMediaResult.rows,
      assignedMedia: assignedMediaResult.rows,
      tvId: parseInt(tvId),
    });
  } catch (err) {
    console.error("Error fetching TV media:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// Authentication API with better validation
app.post("/api/authenticate", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || typeof password !== "string") {
      return res.json({ success: false, error: "Password required" });
    }

    const result = await pool.query(
      "SELECT * FROM admins WHERE username = 'admin'"
    );

    if (result.rows.length > 0) {
      const admin = result.rows[0];
      const isValid = await bcrypt.compare(password, admin.password);
      res.json({ success: isValid });
    } else {
      console.warn("Admin user not found during authentication");
      res.json({ success: false, error: "Admin user not found" });
    }
  } catch (err) {
    console.error("Authentication error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// TV timing update API route with validation
app.post("/api/tv/:tvId/timing", async (req, res) => {
  try {
    const tvId = req.params.tvId;
    const { transitionTime } = req.body;

    // Validate timing
    if (
      !transitionTime ||
      isNaN(transitionTime) ||
      transitionTime < 1000 ||
      transitionTime > 60000
    ) {
      return res
        .status(400)
        .json({ error: "Transition time must be between 1 and 60 seconds" });
    }

    // Verify TV exists
    const tvCheck = await pool.query("SELECT id FROM tvs WHERE id = $1", [
      tvId,
    ]);
    if (tvCheck.rows.length === 0) {
      return res.status(404).json({ error: "TV not found" });
    }

    await pool.query(
      "UPDATE tvs SET image_transition_time = $1 WHERE id = $2",
      [parseInt(transitionTime), tvId]
    );

    console.log(`✅ Updated TV ${tvId} timing to ${transitionTime}ms`);
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating TV timing:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// Enhanced file upload with better error handling
app.post(
  "/admin/upload",
  requireAuth,
  upload.array("media", 10),
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
      const uploadResults = [];
      const failedFiles = [];

      for (const file of req.files) {
        try {
          const fileType = file.mimetype.startsWith("image/")
            ? "image"
            : "video";

          const result = await pool.query(
            "INSERT INTO media (filename, original_name, file_type, file_size, display_order) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [file.filename, file.originalname, fileType, file.size, nextOrder]
          );

          uploadResults.push({
            id: result.rows[0].id,
            filename: file.filename,
            original_name: file.originalname,
            type: fileType,
          });

          nextOrder++;
        } catch (err) {
          console.error(`Error processing file ${file.originalname}:`, err);
          failedFiles.push(file.originalname);

          // Delete the uploaded file if database insert failed
          const filePath = path.join(__dirname, "uploads", file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }

      if (uploadResults.length > 0) {
        console.log(`✅ Successfully uploaded ${uploadResults.length} file(s)`);
        if (failedFiles.length > 0) {
          console.warn(
            `⚠️ Failed to upload ${failedFiles.length} file(s):`,
            failedFiles
          );
        }
        res.redirect("/admin?uploaded=1");
      } else {
        console.log("❌ No files were successfully uploaded");
        res.redirect("/admin?upload_error=1");
      }
    } catch (err) {
      console.error("Upload error:", err);
      res.redirect("/admin?upload_error=1");
    }
  }
);

// Enhanced media deletion with proper cleanup
app.delete("/admin/media/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const mediaId = parseInt(id);

    if (isNaN(mediaId)) {
      return res.status(400).json({ error: "Invalid media ID" });
    }

    // Get media info before deleting
    const mediaResult = await pool.query("SELECT * FROM media WHERE id = $1", [
      mediaId,
    ]);

    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: "Media not found" });
    }

    const media = mediaResult.rows[0];
    const filePath = path.join(__dirname, "uploads", media.filename);

    // Start transaction
    await pool.query("BEGIN");

    try {
      // Delete from tv_media first (foreign key constraint)
      await pool.query("DELETE FROM tv_media WHERE media_id = $1", [mediaId]);

      // Delete from media table
      await pool.query("DELETE FROM media WHERE id = $1", [mediaId]);

      // Commit transaction
      await pool.query("COMMIT");

      // Delete physical file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted file: ${media.filename}`);
      }

      console.log(
        `✅ Successfully deleted media ${mediaId}: ${media.original_name}`
      );
      res.json({ success: true });
    } catch (err) {
      // Rollback transaction on error
      await pool.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("Delete media error:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// Media file serving with better caching and video support
app.get("/uploads/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  // Get file stats
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Handle video streaming with range requests
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": getContentType(filename),
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    // Regular file serving with caching
    const head = {
      "Content-Length": fileSize,
      "Content-Type": getContentType(filename),
      "Cache-Control": "public, max-age=86400", // 24 hours
      ETag: `"${stat.mtime.getTime()}-${fileSize}"`,
      "Last-Modified": stat.mtime.toUTCString(),
    };

    // Check if client has cached version
    const ifNoneMatch = req.headers["if-none-match"];
    const ifModifiedSince = req.headers["if-modified-since"];

    if (
      ifNoneMatch === head.ETag ||
      (ifModifiedSince && new Date(ifModifiedSince) >= stat.mtime)
    ) {
      return res.status(304).end();
    }

    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Helper function to get content type
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".wmv": "video/x-ms-wmv",
    ".webm": "video/webm",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API endpoint to get TV information
app.get("/api/tv/:tvId/info", async (req, res) => {
  try {
    const tvId = req.params.tvId;

    const result = await pool.query(
      `
      SELECT t.*, gs.name as station_name,
             COUNT(tm.id) as assigned_media_count
      FROM tvs t 
      JOIN gas_stations gs ON t.gas_station_id = gs.id 
      LEFT JOIN tv_media tm ON t.id = tm.tv_id AND tm.is_active = true
      WHERE t.id = $1
      GROUP BY t.id, gs.name
    `,
      [tvId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "TV not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching TV info:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Change password route
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

// Logout route
app.get("/admin/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/admin/login");
});

// Start server and initialize database
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`👤 Admin login: http://localhost:${PORT}/admin/login`);
  console.log("🔧 Initializing database...");
  await initializeDatabase();
  console.log("✅ Database initialization complete!");
  console.log("\n📺 TV URLs will be available at:");
  console.log("   http://localhost:${PORT}/tv/[TV_ID]");
  console.log("   (TV IDs will be shown in the admin dashboard)");
});
// Continue in next artifact due to length...
