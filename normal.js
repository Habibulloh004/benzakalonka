
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
                              ? `<img src="/uploads/${
                                  item.filename
                                }?t=${Date.now()}" alt="${item.original_name}">`
                              : `<video autoplay muted playsinline preload="auto" crossorigin="anonymous">
                                  <source src="/uploads/${
                                    item.filename
                                  }?t=${Date.now()}" type="video/${item.filename.split(".").pop()}">
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
                    await forceVideoLoad(video);
                    video.currentTime = 0;
                
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                      await playPromise;
                    }
                    return true;
                  } catch (error) {
                    console.warn('Video autoplay with sound failed:', error);
                
                    // Wait for user gesture to play with sound
                    const playOnInteraction = () => {
                      video.play().catch(e => console.log('User-initiated play failed:', e));
                      document.removeEventListener('click', playOnInteraction);
                      document.removeEventListener('keydown', playOnInteraction);
                    };
                
                    document.addEventListener('click', playOnInteraction);
                    document.addEventListener('keydown', playOnInteraction);
                
                    return false;
                  }
                }
                
                
                function startCarousel() {
                    if (items.length === 0) return;
                    
                    async function showNextItem() {
                        if (carouselTimer) {
                            clearTimeout(carouselTimer);
                            carouselTimer = null;
                        }
                        
                        if (items.length > 1) {
                            items[currentIndex].classList.remove('active');
                            currentIndex = (currentIndex + 1) % items.length;
                            items[currentIndex].classList.add('active');
                        }
                        
                        const currentItem = items[currentIndex];
                        const isVideo = currentItem.dataset.type === 'video';
                        
                        if (isVideo) {
                            const video = currentItem.querySelector('video');
                            const playSuccess = await playVideo(video);
                            
                            if (playSuccess) {
                                video.onended = () => {
                                    if (items.length > 1) {
                                        showNextItem();
                                    } else {
                                        setTimeout(() => playVideo(video), 500);
                                    }
                                };
                            } else {
                                carouselTimer = setTimeout(showNextItem, 3000);
                            }
                        } else {
                            if (items.length > 1) {
                                carouselTimer = setTimeout(showNextItem, transitionTime);
                            }
                        }
                    }
                    
                    const firstItem = items[0];
                    if (firstItem.dataset.type === 'video') {
                        const video = firstItem.querySelector('video');
                        playVideo(video).then(success => {
                            if (success) {
                                video.onended = () => {
                                    if (items.length > 1) {
                                        showNextItem();
                                    } else {
                                        setTimeout(() => playVideo(video), 500);
                                    }
                                };
                            } else if (items.length > 1) {
                                carouselTimer = setTimeout(showNextItem, 3000);
                            }
                        });
                    } else if (items.length > 1) {
                        carouselTimer = setTimeout(showNextItem, transitionTime);
                    }
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
                    setTimeout(startCarousel, 500);
                });
                
                document.addEventListener('error', function(e) {
                    if (e.target.tagName === 'VIDEO') {
                        console.error('Video failed to load:', e.target.src);
                    }
                }, true);
                
                document.addEventListener('visibilitychange', function() {
                    if (!document.hidden && items.length > 0) {
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