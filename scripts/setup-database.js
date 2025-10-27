import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const setupDatabase = async () => {
    let connection;

    try {
        // Connect to MySQL server (without database)
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            multipleStatements: true
        });

        console.log('Connected to MySQL server');

        // Create database if it doesn't exist
        await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
        console.log(` Database '${process.env.DB_NAME}' created/verified`);
        // Switch to the database
        await connection.query(`USE \`${process.env.DB_NAME}\``);
        // Read and execute schema file
        const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');

        try {
            const schema = await fs.readFile(schemaPath, 'utf8');
            await connection.query(schema);
            // const statements = schema.split(';').filter(stmt => stmt.trim());

            // for (const statement of statements) {
            //     if (statement.trim()) {
            //     }
            // }

            console.log(' Database schema created successfully');

        } catch (fileError) {
            console.log('Schema file not found, creating tables manually...');

            // Create tables manually (fallback)
            const tables = [
                `CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          reseller_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,

                `CREATE TABLE IF NOT EXISTS facebook_accounts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          facebook_user_id VARCHAR(255) NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          token_expires_at TIMESTAMP NULL,
          account_name VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

                `CREATE TABLE IF NOT EXISTS ghl_accounts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          location_id VARCHAR(255) NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          location_name VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`
            ];

            for (const table of tables) {
                await connection.execute(table);
            }

            console.log(' Basic tables created successfully');
        }

        console.log(' Database setup completed successfully!');

    } catch (error) {
        console.error(' Database setup failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};

// Run setup
setupDatabase();