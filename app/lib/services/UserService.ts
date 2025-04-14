import { supabase } from '../supabase';
import { User } from '@supabase/supabase-js';

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  lastLogin: Date | null;
}

/**
 * Service for handling user operations
 */
export class UserService {
  /**
   * Get the current authenticated user
   * @returns The current user or null if not authenticated
   */
  static async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }

  /**
   * Get or create a user profile
   * @param authUser The authenticated user from Supabase Auth
   * @returns The user profile
   */
  static async getOrCreateUserProfile(authUser: User): Promise<AppUser | null> {
    if (!authUser) return null;
    
    // Check if user already exists in our users table
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', authUser.id)
      .single();
      
    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error fetching user profile:', fetchError);
      return null;
    }
    
    // If user exists, update last login and return
    if (existingUser) {
      // Update last login
      const { error: updateError } = await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('user_id', authUser.id);
        
      if (updateError) {
        console.error('Error updating last login:', updateError);
      }
      
      return {
        id: existingUser.user_id,
        email: existingUser.email,
        name: existingUser.name,
        createdAt: new Date(existingUser.created_at),
        lastLogin: new Date(existingUser.last_login)
      };
    }
    
    // If user doesn't exist, create a new profile
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        user_id: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata.name || null,
        last_login: new Date().toISOString()
      })
      .select()
      .single();
      
    if (createError) {
      console.error('Error creating user profile:', createError);
      return null;
    }
    
    return {
      id: newUser.user_id,
      email: newUser.email,
      name: newUser.name,
      createdAt: new Date(newUser.created_at),
      lastLogin: new Date(newUser.last_login)
    };
  }

  /**
   * Update a user's profile information
   * @param userId The user ID
   * @param data The data to update
   * @returns Success status
   */
  static async updateUserProfile(
    userId: string,
    data: { name?: string }
  ): Promise<boolean> {
    const { error } = await supabase
      .from('users')
      .update(data)
      .eq('user_id', userId);
      
    if (error) {
      console.error('Error updating user profile:', error);
      return false;
    }
    
    return true;
  }
} 