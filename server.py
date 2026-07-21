import os
import sqlite3
import uuid
import json
import random
import smtplib
from email.mime.text import MIMEText
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS  # 1. Import it

app = Flask(__name__)
CORS(app)  # 2. Enable it for your app


# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'projectnest.db')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# --- CUSTOM CORS MIDDLEWARE ---
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    return response

@app.route('/api/ping', methods=['OPTIONS', 'GET'])
def ping():
    return jsonify({"status": "healthy"})

# --- DATABASE CONNECTION UTILITIES ---
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# --- INIT DATABASE AND SEED DATA ---
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Create Tables
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        name TEXT,
        mobile TEXT,
        college TEXT,
        uni TEXT,
        branch TEXT,
        semester TEXT,
        password TEXT,
        role TEXT,
        blocked INTEGER
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT,
        category TEXT,
        subcat TEXT,
        description TEXT,
        difficulty TEXT,
        price INTEGER,
        completionTime TEXT,
        components TEXT, -- JSON string
        software TEXT,   -- JSON string
        hardware TEXT,   -- JSON string
        mentorId TEXT,
        rating REAL,
        reviewsCount INTEGER
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS components (
        id TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        price INTEGER,
        stock INTEGER,
        specs TEXT
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS mentors (
        id TEXT PRIMARY KEY,
        name TEXT,
        specialties TEXT,
        company TEXT,
        rating REAL,
        bookingsFee INTEGER,
        picPath TEXT
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        orderId TEXT,
        date TEXT,
        total INTEGER,
        discount INTEGER,
        gst INTEGER,
        subtotal INTEGER,
        gstNumber TEXT,
        paymentMethod TEXT,
        email TEXT,
        status TEXT
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        mentorName TEXT,
        date TEXT,
        time TEXT,
        type TEXT,
        studentEmail TEXT,
        status TEXT
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS forum_threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        category TEXT,
        author TEXT,
        content TEXT,
        likes INTEGER,
        date TEXT
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS forum_replies (
        id TEXT PRIMARY KEY,
        threadId TEXT,
        author TEXT,
        content TEXT
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS purchased_projects (
        id TEXT PRIMARY KEY,
        email TEXT,
        projectId TEXT,
        progressStep INTEGER,
        files TEXT -- JSON string
    )
    ''')

    conn.commit()

    # Seed Default Data if empty
    cursor.execute('SELECT COUNT(*) FROM users')
    if cursor.fetchone()[0] == 0:
        cursor.executemany('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            ('student@test.com', 'Ankush Anand', '+91 9876543210', 'Delhi Technological University', 'DTU', 'ECE', '6', 'password', 'student', 0),
            ('admin@projectnest.com', 'Platform Administrator', '+91 9999988888', 'ProjectNest HQ', 'Admin', 'CSE', '8', 'admin', 'admin', 0)
        ])

    cursor.execute('SELECT COUNT(*) FROM projects')
    if cursor.fetchone()[0] == 0:
        cursor.executemany('INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            ('p1', 'IoT Smart Agriculture Irrigation System using ESP32 & Blynk', 'ECE', 'IoT', 
             'An intelligent irrigation setup designed to automatically irrigate crop fields based on real-time soil moisture and environmental parameters. Uses ESP32 for cloud communication, soil moisture sensors, DHT11 humidity/temperature sensor, and an automated relay water pump. Relies on Firebase telemetry database and features a mobile application interface.', 
             'Medium', 2499, '30 hours', 
             json.dumps(['ESP32 Development Board', 'Soil Moisture Sensor', 'DHT11 Humidity Sensor', '5V Relay Module', 'Submersible Water Pump', 'Breadboard & Wires']),
             json.dumps(['Arduino IDE', 'Blynk IoT App', 'C++ Language']),
             json.dumps(['ESP32 NodeMCU', 'Relay circuitry', 'Water pipe attachments']),
             'm1', 4.8, 14),
             
            ('p2', 'Real-Time Driver Drowsiness Detection System with OpenCV', 'CSE', 'AI & Machine Learning', 
             'A safety system for automobiles designed to detect driver drowsiness and trigger a buzzer. Built with Python using Dlib facial landmark detection and OpenCV image processing to measure eye aspect ratio (EAR) and mouth yawn frequency in real-time webcams.', 
             'Hard', 3200, '45 hours', 
             json.dumps(['USB Webcam', 'Raspberry Pi 4 (Optional)', 'Active Buzzer']),
             json.dumps(['Python 3', 'OpenCV Library', 'Dlib Facial Landmarks Model', 'VS Code']),
             json.dumps(['Processor board or Desktop system', 'Visual camera']),
             'm2', 4.9, 22),

            ('p3', 'Autonomous Path Finding Robot using LiDAR & SLAM', 'Mech', 'Robotics', 
             'An advanced robotic vehicle configured to map indoor rooms and safely navigate around obstacles using LiDAR sensors, ROS (Robot Operating System), and Gmapping SLAM navigation modules.', 
             'Hard', 4999, '60 hours', 
             json.dumps(['RPLIDAR A1', 'Raspberry Pi 4', 'Arduino Mega 2560', 'L298N Motor Driver', 'Chassis with Encoder Motors']),
             json.dumps(['ROS Noetic', 'Linux Ubuntu 20.04', 'Python / C++']),
             json.dumps(['Custom acrylic chassis', 'DC geared motors', '12V battery source']),
             'm1', 4.7, 8),

            ('p4', 'Smart Home Automation Controller using Raspberry Pi', 'EE', 'Embedded Systems', 
             'A comprehensive home automation setup controlled via a secure web dashboard hosted on a local Raspberry Pi. Integrates appliance relays, temperature monitoring, and voice alerts.', 
             'Medium', 2199, '25 hours', 
             json.dumps(['Raspberry Pi 3/4', '8-Channel Relay Module', 'DHT22 Sensor', 'Jumper wires']),
             json.dumps(['Node-RED', 'Python', 'HTML/CSS/JS Dash']),
             json.dumps(['AC socket array', 'Pi case']),
             'm3', 4.6, 16),

            ('p5', 'Seismic Load Performance Analysis of Multi-Story Structure', 'Civil', 'Civil Engineering', 
             'A simulation-based structural analysis determining structural behavior and stress limits of a 15-story skyscraper framework subjected to seismic lateral forces in different earthquake zones.', 
             'Medium', 1800, '20 hours', 
             json.dumps(['Computer Node for computation']),
             json.dumps(['ETABS v19', 'AutoCAD structural drawing template', 'MS Excel sheets']),
             json.dumps(['No hardware required']),
             'm4', 4.5, 9)
        ])

    cursor.execute('SELECT COUNT(*) FROM components')
    if cursor.fetchone()[0] == 0:
        cursor.executemany('INSERT INTO components VALUES (?, ?, ?, ?, ?, ?)', [
            ('c1', 'Arduino Uno R3 Dev Board', 'Arduino', 450, 45, 'ATmega328P, 16MHz, 5V'),
            ('c2', 'ESP32 Wi-Fi + Bluetooth NodeMCU', 'ESP32', 380, 60, 'Dual-Core, 2.4GHz, 4MB Flash'),
            ('c3', 'Raspberry Pi 4 Model B (4GB)', 'Raspberry Pi', 4990, 12, 'Quad-core 1.5GHz, 4GB LPDDR4'),
            ('c4', 'Ultrasonic Distance Sensor HC-SR04', 'Sensors', 80, 150, 'Range: 2cm-400cm, 5V operating'),
            ('c5', 'SG90 Micro Servo Motor 9g', 'Motors', 120, 95, 'Speed: 0.12s/60deg, Torque: 1.2kg-cm'),
            ('c6', '16x2 I2C Character LCD Display', 'LCD', 250, 35, 'I2C Backlight, White on Blue character'),
            ('c7', '5V Dual Channel Relay Module', 'Relay', 140, 55, 'Opto-isolated, 10A 250VAC limit'),
            ('c8', '4-Wheel Smart Robot Chassis Kit', 'Robotics Kits', 1100, 15, 'Bo Motors, Encoder Wheels, battery holder')
        ])

    cursor.execute('SELECT COUNT(*) FROM mentors')
    if cursor.fetchone()[0] == 0:
        cursor.executemany('INSERT INTO mentors VALUES (?, ?, ?, ?, ?, ?, ?)', [
            ('m1', 'Dr. Ankush Sen', 'IoT, Robotics, Embedded Circuitry', 'Ex-Intel Engineering Lead', 4.9, 1800, ''),
            ('m2', 'Rohan Sharma', 'Computer Vision, ML, Neural Networks', 'Senior AI Engineer at Google', 4.8, 2200, ''),
            ('m3', 'Sneha Roy', 'Power Networks, Embedded Systems, IoT', 'Research Scholar at IIT Delhi', 4.7, 1200, ''),
            ('m4', 'Amit Verma', 'Structural Simulations, ETABS, CAD Design', 'Senior Consultant Structural Architect', 4.6, 1500, '')
        ])

    cursor.execute('SELECT COUNT(*) FROM forum_threads')
    if cursor.fetchone()[0] == 0:
        cursor.execute('INSERT INTO forum_threads VALUES (?, ?, ?, ?, ?, ?, ?)', 
                       ('f1', 'ESP32 Wi-Fi not connecting after firmware flash', 'ECE', 'student@test.com', 
                        'I uploaded my basic blink and Blynk controller code on NodeMCU ESP32, but serial monitor output is showing endless dots. Wi-Fi credentials are correct. How to solve?', 12, '2026-07-10'))
        cursor.execute('INSERT INTO forum_replies VALUES (?, ?, ?, ?)', 
                       ('fr1', 'f1', 'Dr. Ankush Sen', 'Make sure your Wi-Fi frequency is 2.4GHz. ESP32 does not support 5GHz network lines.'))

    conn.commit()
    conn.close()

init_db()

# --- SERVE MENTOR IMAGES ---
@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# --- SERVE FRONTEND STATIC FILES ---
@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    # Security filter: block access to system/sensitive files
    if filename.endswith('.py') or filename.endswith('.db') or filename.endswith('.txt') or filename.startswith('.'):
        return jsonify({"error": "Forbidden"}), 403
    return send_from_directory(BASE_DIR, filename)

# --- AUTH ENDPOINTS ---
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE email = ? AND password = ?', (email, password)).fetchone()
    conn.close()

    if user:
        if user['blocked'] == 1:
            return jsonify({"error": "This account has been blocked by Admin."}), 403
        return jsonify({
            "email": user['email'],
            "name": user['name'],
            "mobile": user['mobile'],
            "college": user['college'],
            "uni": user['uni'],
            "branch": user['branch'],
            "semester": user['semester'],
            "role": user['role']
        })
    return jsonify({"error": "Invalid credentials"}), 401

# --- IN-MEMORY OTP STORE ---
# Key: email, Value: {"otp": otp, "expires_at": timestamp}
otp_store = {}

def send_otp_email(email, otp):
    smtp_server = os.environ.get('SMTP_SERVER')
    smtp_port = os.environ.get('SMTP_PORT', '587')
    smtp_user = os.environ.get('SMTP_USER')
    smtp_password = os.environ.get('SMTP_PASSWORD')

    subject = "Your ProjectNest Registration OTP"
    body = f"Hello,\n\nYour OTP for registration at ProjectNest is: {otp}\nThis code is valid for 5 minutes.\n\nThank you,\nProjectNest Team"

    # Print log message in development
    print(f"\n[OTP SYSTEM] Generated OTP {otp} for email {email}", flush=True)

    if not smtp_server or not smtp_user or not smtp_password:
        print("[OTP SYSTEM] SMTP configuration is missing. Printing OTP to terminal logs instead of sending email.\n", flush=True)
        return True

    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = smtp_user
        msg['To'] = email

        with smtplib.SMTP(smtp_server, int(smtp_port)) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        print(f"[OTP SYSTEM] Successfully sent OTP to {email} via SMTP.\n", flush=True)
        return True
    except Exception as e:
        print(f"[OTP SYSTEM] Error sending email to {email}: {str(e)}\n", flush=True)
        return False

@app.route('/api/auth/send-otp', methods=['POST'])
def send_otp():
    data = request.json
    email = data.get('email')
    if not email:
        return jsonify({"error": "Email is required"}), 400

    # Generate 6-digit OTP
    otp = f"{random.randint(100000, 999999)}"
    expires_at = datetime.now().timestamp() + 300  # 5 minutes validity

    # Send the email
    success = send_otp_email(email, otp)
    if success:
        otp_store[email] = {"otp": otp, "expires_at": expires_at}
        return jsonify({"success": "OTP sent successfully"})
    else:
        # If sending fails but no SMTP configuration was provided, still succeed (development mode fallback)
        if not os.environ.get('SMTP_SERVER'):
            otp_store[email] = {"otp": otp, "expires_at": expires_at}
            return jsonify({"success": "OTP generated (development mode)", "dev_mode": True, "otp": otp})
        return jsonify({"error": "Failed to send OTP email"}), 500

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')

    if not email:
        return jsonify({"error": "Email is required"}), 400

    conn = get_db_connection()
    
    # Check if exists
    exists = conn.execute('SELECT email FROM users WHERE email = ?', (email,)).fetchone()
    if exists:
        conn.close()
        return jsonify({"error": "Email is already registered"}), 400

    try:
        conn.execute('''
        INSERT INTO users (email, name, mobile, college, uni, branch, semester, password, role, blocked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'student', 0)
        ''', (
            email,
            data.get('name'),
            data.get('mobile'),
            data.get('college'),
            data.get('uni'),
            data.get('branch'),
            data.get('semester'),
            data.get('password')
        ))
        conn.commit()
        conn.close()
        return jsonify({"success": "User registered successfully"})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

# --- PROJECTS ENDPOINTS ---
@app.route('/api/projects', methods=['GET'])
def get_projects():
    conn = get_db_connection()
    projects = conn.execute('SELECT * FROM projects').fetchall()
    conn.close()

    result = []
    for p in projects:
        result.append({
            "id": p['id'],
            "title": p['title'],
            "category": p['category'],
            "subcat": p['subcat'],
            "description": p['description'],
            "difficulty": p['difficulty'],
            "price": p['price'],
            "completionTime": p['completionTime'],
            "components": json.loads(p['components']),
            "software": json.loads(p['software']),
            "hardware": json.loads(p['hardware']),
            "mentorId": p['mentorId'],
            "rating": p['rating'],
            "reviewsCount": p['reviewsCount'],
            "faqs": [
              { "q": "Is hardware assembly guide included?", "a": "Yes, step-by-step schematics and video tutorials are provided." },
              { "q": "Can I replace ESP32 with Arduino Uno?", "a": "Yes, but you will need an external ESP8266 Wi-Fi shield for internet features." }
            ]
        })
    return jsonify(result)

@app.route('/api/admin/projects/add', methods=['POST'])
def add_project():
    data = request.json
    proj_id = 'p' + str(uuid.uuid4().hex[:6])
    
    conn = get_db_connection()
    try:
        conn.execute('''
        INSERT INTO projects (id, title, category, subcat, description, difficulty, price, completionTime, components, software, hardware, mentorId, rating, reviewsCount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4.8, 1)
        ''', (
            proj_id,
            data.get('title'),
            data.get('category'),
            data.get('subcat', 'Custom Integration'),
            data.get('description'),
            data.get('difficulty'),
            data.get('price'),
            data.get('completionTime', '30 hours'),
            json.dumps(data.get('components', [])),
            json.dumps(['Arduino IDE', 'VS Code']),
            json.dumps(['Integrated Circuit Grid']),
            'm1'
        ))
        conn.commit()
        conn.close()
        return jsonify({"success": "Project added successfully", "id": proj_id})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/projects/delete/<id>', methods=['DELETE'])
def delete_project(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM projects WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": "Project deleted successfully"})

# --- COMPONENTS ENDPOINTS ---
@app.route('/api/components', methods=['GET'])
def get_components():
    conn = get_db_connection()
    components = conn.execute('SELECT * FROM components').fetchall()
    conn.close()
    
    result = []
    for c in components:
        result.append({
            "id": c['id'],
            "name": c['name'],
            "category": c['category'],
            "price": c['price'],
            "stock": c['stock'],
            "specs": c['specs']
        })
    return jsonify(result)

@app.route('/api/admin/components/add', methods=['POST'])
def add_component():
    data = request.json
    comp_id = 'c' + str(uuid.uuid4().hex[:6])
    
    conn = get_db_connection()
    try:
        conn.execute('''
        INSERT INTO components (id, name, category, price, stock, specs)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            comp_id,
            data.get('name'),
            data.get('category'),
            data.get('price'),
            data.get('stock'),
            data.get('specs')
        ))
        conn.commit()
        conn.close()
        return jsonify({"success": "Component added successfully", "id": comp_id})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/components/delete/<id>', methods=['DELETE'])
def delete_component(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM components WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": "Component deleted successfully"})

@app.route('/api/admin/components/adjust-stock', methods=['POST'])
def adjust_stock():
    data = request.json
    comp_id = data.get('id')
    amount = data.get('amount', 0)
    
    conn = get_db_connection()
    conn.execute('UPDATE components SET stock = stock + ? WHERE id = ?', (amount, comp_id))
    conn.commit()
    conn.close()
    return jsonify({"success": "Stock adjusted successfully"})

# --- MENTORS ENDPOINTS (WITH PHOTO UPLOAD SUPPORT) ---
@app.route('/api/mentors', methods=['GET'])
def get_mentors():
    conn = get_db_connection()
    mentors = conn.execute('SELECT * FROM mentors').fetchall()
    conn.close()
    
    result = []
    for m in mentors:
        pic = m['picPath']
        if pic and not pic.startswith('http') and not pic.startswith('/'):
            pic = '/uploads/' + pic
            
        result.append({
            "id": m['id'],
            "name": m['name'],
            "specialties": m['specialties'],
            "company": m['company'],
            "rating": m['rating'],
            "bookingsFee": m['bookingsFee'],
            "picPath": pic or 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80'
        })
    return jsonify(result)

@app.route('/api/admin/mentors/add', methods=['POST'])
def add_mentor():
    name = request.form.get('name')
    specialties = request.form.get('specialties')
    company = request.form.get('company')
    bookingsFee = request.form.get('bookingsFee', 1000)
    
    # Handle Pic Upload
    pic_filename = ''
    if 'pic' in request.files:
        file = request.files['pic']
        if file and file.filename != '':
            ext = os.path.splitext(file.filename)[1]
            pic_filename = str(uuid.uuid4().hex) + ext
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], pic_filename))

    mentor_id = 'm' + str(uuid.uuid4().hex[:6])
    
    conn = get_db_connection()
    try:
        conn.execute('''
        INSERT INTO mentors (id, name, specialties, company, rating, bookingsFee, picPath)
        VALUES (?, ?, ?, ?, 4.8, ?, ?)
        ''', (mentor_id, name, specialties, company, int(bookingsFee), pic_filename))
        conn.commit()
        conn.close()
        return jsonify({"success": "Mentor profile saved and verified", "id": mentor_id})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/mentors/delete/<id>', methods=['DELETE'])
def delete_mentor(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM mentors WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": "Mentor profile deleted successfully"})

# --- ORDERS AND PURCHASED PROGRESS ENDPOINTS ---
@app.route('/api/orders', methods=['GET', 'POST'])
def manage_orders():
    if request.method == 'GET':
        email = request.args.get('email')
        conn = get_db_connection()
        if email:
            orders = conn.execute('SELECT * FROM orders WHERE email = ?', (email,)).fetchall()
        else:
            orders = conn.execute('SELECT * FROM orders').fetchall()
        conn.close()
        
        result = []
        for o in orders:
            # Query items from orders list (normally normalized, mock-saving item detail array to database as custom json or query from purchased table)
            # For simplicity, we just return basic fields
            result.append({
                "id": o['id'],
                "orderId": o['orderId'],
                "date": o['date'],
                "subtotal": o['subtotal'],
                "discount": o['discount'],
                "gst": o['gst'],
                "totalPrice": o['total'],
                "gstNumber": o['gstNumber'],
                "paymentMethod": o['paymentMethod'],
                "email": o['email'],
                "status": o['status'],
                "items": [] # Filled by frontend app logic mapping
            })
        return jsonify(result)
        
    else:
        data = request.json
        order_id = 'ORD-' + str(uuid.uuid4().hex[:6]).upper()
        
        conn = get_db_connection()
        try:
            conn.execute('''
            INSERT INTO orders (id, orderId, date, total, discount, gst, subtotal, gstNumber, paymentMethod, email, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid')
            ''', (
                uuid.uuid4().hex,
                order_id,
                datetime.today().strftime('%Y-%m-%d'),
                data.get('totalPrice'),
                data.get('discount', 0),
                data.get('gst', 0),
                data.get('subtotal'),
                data.get('gstNumber', 'N/A'),
                data.get('paymentMethod'),
                data.get('email')
            ))
            
            # Map cart items to purchased projects or reduce inventory stocks
            items = data.get('items', [])
            for item in items:
                if item.get('type') == 'project':
                    conn.execute('''
                    INSERT INTO purchased_projects (id, email, projectId, progressStep, files)
                    VALUES (?, ?, ?, 1, ?)
                    ''', (
                        uuid.uuid4().hex,
                        data.get('email'),
                        item.get('id'),
                        json.dumps(['Thesis_Report.pdf', 'Circuit_Schematics.pdf', 'Firmware_V1.ino'])
                    ))
                elif item.get('type') == 'component':
                    conn.execute('UPDATE components SET stock = MAX(0, stock - ?) WHERE id = ?', (item.get('qty', 1), item.get('id')))
            
            conn.commit()
            conn.close()
            return jsonify({"success": "Order created successfully", "orderId": order_id})
        except Exception as e:
            conn.close()
            return jsonify({"error": str(e)}), 500

# --- APPOINTMENTS ENDPOINTS ---
@app.route('/api/appointments', methods=['GET', 'POST'])
def manage_appointments():
    conn = get_db_connection()
    if request.method == 'GET':
        email = request.args.get('email')
        if email:
            apts = conn.execute('SELECT * FROM appointments WHERE studentEmail = ?', (email,)).fetchall()
        else:
            apts = conn.execute('SELECT * FROM appointments').fetchall()
        conn.close()
        
        result = []
        for a in apts:
            result.append({
                "id": a['id'],
                "mentorName": a['mentorName'],
                "date": a['date'],
                "time": a['time'],
                "type": a['type'],
                "studentEmail": a['studentEmail'],
                "status": a['status']
            })
        return jsonify(result)
    else:
        data = request.json
        apt_id = 'APT-' + str(uuid.uuid4().hex[:6]).upper()
        try:
            conn.execute('''
            INSERT INTO appointments (id, mentorName, date, time, type, studentEmail, status)
            VALUES (?, ?, ?, ?, ?, ?, 'Scheduled')
            ''', (apt_id, data.get('mentorName'), data.get('date'), data.get('time'), data.get('type'), data.get('studentEmail')))
            conn.commit()
            conn.close()
            return jsonify({"success": "Appointment scheduled", "id": apt_id})
        except Exception as e:
            conn.close()
            return jsonify({"error": str(e)}), 500

# --- FORUM ENDPOINTS ---
@app.route('/api/forum', methods=['GET', 'POST'])
def manage_forum():
    conn = get_db_connection()
    if request.method == 'GET':
        threads = conn.execute('SELECT * FROM forum_threads ORDER BY date DESC').fetchall()
        
        result = []
        for t in threads:
            replies = conn.execute('SELECT * FROM forum_replies WHERE threadId = ?', (t['id'],)).fetchall()
            reply_list = [{"author": r['author'], "content": r['content']} for r in replies]
            
            result.append({
                "id": t['id'],
                "title": t['title'],
                "category": t['category'],
                "author": t['author'],
                "content": t['content'],
                "likes": t['likes'],
                "date": t['date'],
                "replies": reply_list
            })
        conn.close()
        return jsonify(result)
    else:
        data = request.json
        thread_id = 'f-' + str(uuid.uuid4().hex[:6])
        try:
            conn.execute('''
            INSERT INTO forum_threads (id, title, category, author, content, likes, date)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            ''', (thread_id, data.get('title'), data.get('category'), data.get('author'), data.get('content'), datetime.today().strftime('%Y-%m-%d')))
            conn.commit()
            conn.close()
            return jsonify({"success": "Thread created", "id": thread_id})
        except Exception as e:
            conn.close()
            return jsonify({"error": str(e)}), 500

@app.route('/api/forum/<id>/reply', methods=['POST'])
def reply_forum(id):
    data = request.json
    conn = get_db_connection()
    try:
        conn.execute('''
        INSERT INTO forum_replies (id, threadId, author, content)
        VALUES (?, ?, ?, ?)
        ''', (str(uuid.uuid4().hex), id, data.get('author'), data.get('content')))
        conn.commit()
        conn.close()
        return jsonify({"success": "Reply posted successfully"})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/forum/<id>/like', methods=['POST'])
def like_forum(id):
    conn = get_db_connection()
    conn.execute('UPDATE forum_threads SET likes = likes + 1 WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": "Like registered"})

# --- STUDENT DASHBOARD ENDPOINTS ---
@app.route('/api/dashboard/projects', methods=['GET'])
def get_purchased_projects():
    email = request.args.get('email')
    if not email:
        return jsonify([])
        
    conn = get_db_connection()
    p_projects = conn.execute('''
        SELECT pp.*, p.title 
        FROM purchased_projects pp
        JOIN projects p ON pp.projectId = p.id
        WHERE pp.email = ?
    ''', (email,)).fetchall()
    conn.close()
    
    result = []
    for pp in p_projects:
        result.append({
            "id": pp['projectId'],
            "title": pp['title'],
            "progressStep": pp['progressStep'],
            "files": json.loads(pp['files'])
        })
    return jsonify(result)

@app.route('/api/dashboard/progress', methods=['POST'])
def update_progress_step():
    data = request.json
    email = data.get('email')
    project_id = data.get('projectId')
    step = data.get('step')
    
    conn = get_db_connection()
    conn.execute('''
        UPDATE purchased_projects 
        SET progressStep = ? 
        WHERE email = ? AND projectId = ?
    ''', (step, email, project_id))
    conn.commit()
    conn.close()
    return jsonify({"success": "Progress step updated"})

# --- ADMIN USERS ENDPOINTS ---
@app.route('/api/admin/users', methods=['GET'])
def get_admin_users():
    conn = get_db_connection()
    users = conn.execute('SELECT email, name, mobile, college, uni, branch, semester, role, blocked FROM users').fetchall()
    conn.close()
    
    result = []
    for u in users:
        result.append({
            "email": u['email'],
            "name": u['name'],
            "mobile": u['mobile'],
            "college": u['college'],
            "uni": u['uni'],
            "branch": u['branch'],
            "semester": u['semester'],
            "role": u['role'],
            "blocked": u['blocked']
        })
    return jsonify(result)

@app.route('/api/admin/users/block', methods=['POST'])
def toggle_block_user():
    data = request.json
    email = data.get('email')
    
    conn = get_db_connection()
    user = conn.execute('SELECT blocked FROM users WHERE email = ?', (email,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    new_status = 1 if user['blocked'] == 0 else 0
    conn.execute('UPDATE users SET blocked = ? WHERE email = ?', (new_status, email))
    conn.commit()
    conn.close()
    return jsonify({"success": "User block status modified", "blocked": new_status})

@app.route('/api/admin/users/delete/<email>', methods=['DELETE'])
def delete_user(email):
    conn = get_db_connection()
    conn.execute('DELETE FROM users WHERE email = ?', (email,))
    conn.commit()
    conn.close()
    return jsonify({"success": "User deleted successfully"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
