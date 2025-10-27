import express from 'express';
import { User } from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate, registerSchema, loginSchema, changePasswordSchema } from '../utils/validation.js';
import { sendResetEmail } from '../utils/email.js';

const router = express.Router();

// Register new user
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    console.log(name);
    console.log(password)
    // const { email, password, role, reseller_id } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Create user
    const user = await User.create({ name, email, password, role: 'user' });

    // Generate token
    const token = User.generateToken(user.id, user.name, user.email, user.role);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          reseller_id: user.reseller_id,
          created_at: user.created_at
        },
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Login user
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Validate password
    const isValidPassword = await User.validatePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Update last login
    await User.updateLastLogin(user.id);

    // Generate token
    const token = User.generateToken(user.id, user.name, user.email, user.role);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          reseller_id: user.reseller_id,
          created_at: user.created_at
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          reseller_id: user.reseller_id,
          created_at: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('Profile fetch error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
});

// Change password
router.post('/change-password', authenticateToken, validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password hash
    const user = await User.findByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate current password
    const isValidPassword = await User.validatePassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password
    await User.updatePassword(req.user.id, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

// Logout (client-side token removal, server-side validation)
router.post('/logout', authenticateToken, (req, res) => {
  // In a more advanced implementation, you could maintain a blacklist of tokens
  // For now, we rely on client-side token removal
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Token validation endpoint
router.get('/validate', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        reseller_id: req.user.reseller_id
      },
    }
  });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    const token = User.generateResetToken(user.id, user.email);
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await sendResetEmail(email, resetLink);

    res.json({ success: true, message: 'Reset email sent successfully' });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to send reset email' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const decoded = User.verifyResetToken(token);

    await User.updatePassword(decoded.userId, newPassword);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/change-name', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    await User.changeName(req.user.id, name);
    res.json({ success: true, message: 'Name changed successfully' });
  } catch (error) {
    console.error('Change name error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to change name' });
  }
})

export default router;


