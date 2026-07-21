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
            ('student@test.com', 'Ankush Anand', '+91 9876543210', 'Delhi