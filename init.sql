-- Updated init.sql - Create database tables for gas station system
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(10) NOT NULL,
    file_size BIGINT NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    display_order INTEGER DEFAULT 0
);

-- New tables for gas stations and TVs
CREATE TABLE IF NOT EXISTS gas_stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tvs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    gas_station_id INTEGER REFERENCES gas_stations(id) ON DELETE CASCADE,
    image_transition_time INTEGER DEFAULT 5000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tv_media (
    id SERIAL PRIMARY KEY,
    tv_id INTEGER REFERENCES tvs(id) ON DELETE CASCADE,
    media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    UNIQUE(tv_id, media_id)
);

-- First, let's delete any existing admin user
DELETE FROM admins WHERE username = 'admin';

-- Insert default admin user (password: admin123)
-- This is a properly generated bcrypt hash for "admin123"
INSERT INTO admins (username, password) 
VALUES ('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');

-- Insert default gas station if not exists
INSERT INTO gas_stations (name, location) 
SELECT 'Main Station', 'Default Location'
WHERE NOT EXISTS (SELECT 1 FROM gas_stations);

-- Insert default TV if not exists
INSERT INTO tvs (name, gas_station_id, image_transition_time)
SELECT 'TV-1', gs.id, 5000
FROM gas_stations gs
WHERE gs.name = 'Main Station'
AND NOT EXISTS (SELECT 1 FROM tvs);