import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, transaction } from '../config/database.js';

export class User {
  static async create(userData) {
    try {
      const {name, email, password, role = 'user', reseller_id = null } = userData;
      
      // Hash password
      const saltRounds = 12;
      const password_hash = await bcrypt.hash(password, saltRounds);
      
      // Insert user
      const result = await query(
        'INSERT INTO users (name,email, password_hash, role, reseller_id) VALUES (?, ?, ?, ?, ?)',
        [name ,email, password_hash, role, reseller_id]
      );
      
      // Get created user
      const users = await query(
        'SELECT id,name, email, role, reseller_id, created_at FROM users WHERE id = ?',
        [result.insertId]
      );
      
      return users[0];
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Email already exists');
      }
      throw new Error(`User creation failed: ${error.message}`);
    }
  }

  static async findByEmail(email) {
    try {
      const users = await query(
        'SELECT id,name, email, password_hash, role, reseller_id, created_at FROM users WHERE email = ?',
        [email]
      );
      
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      throw new Error(`User lookup failed: ${error.message}`);
    }
  }

  static async findById(id) {
    try {
      const users = await query(
        'SELECT id,name, email, role, reseller_id, created_at FROM users WHERE id = ?',
        [id]
      );
      
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      throw new Error(`User lookup failed: ${error.message}`);
    }
  }

  static async validatePassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      throw new Error('Password validation failed');
    }
  }

  static generateToken(userId, email, role) {
    try {
      const payload = {
        userId,
        email,
        role,
        iat: Math.floor(Date.now() / 1000)
      };
      
      return jwt.sign(
        payload, 
        process.env.JWT_SECRET,
        { 
          expiresIn: process.env.JWT_EXPIRES_IN || '24h',
          issuer: 'fb-ghl-integration',
          audience: 'fb-ghl-users'
        }
      );
    } catch (error) {
      throw new Error('Token generation failed');
    }
  }

  static async updateLastLogin(userId) {
    try {
      await query(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [userId]
      );
    } catch (error) {
      // Log error but don't throw - last login update is not critical
      console.error('Failed to update last login:', error.message);
    }
  }

  static async updatePassword(userId, newPassword) {
    try {
      const saltRounds = 12;
      const password_hash = await bcrypt.hash(newPassword, saltRounds);
      
      await query(
        'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [password_hash, userId]
      );
      
      return true;
    } catch (error) {
      throw new Error(`Password update failed: ${error.message}`);
    }
  }

  static async delete(userId) {
    return await transaction(async (connection) => {
      // Delete user and all related data (cascading deletes will handle the rest)
      await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
      return true;
    });
  }

  static async list(limit = 50, offset = 0, reseller_id = null) {
    try {
      let sql = 'SELECT id,name, email, role, reseller_id, created_at FROM users';
      let params = [];
      
      if (reseller_id !== null) {
        sql += ' WHERE reseller_id = ?';
        params.push(reseller_id);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const users = await query(sql, params);
      return users;
    } catch (error) {
      throw new Error(`User listing failed: ${error.message}`);
    }
  }
}