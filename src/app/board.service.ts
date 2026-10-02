import { Injectable } from '@angular/core';
import { supabase } from './supabase.client';

@Injectable({ providedIn: 'root' })
export class BoardService {
  async createBoard(): Promise<string> {
    const { data, error } = await supabase.from('boards').insert({}).select('id').single();
    if (error) throw error;
    return data.id as string;
  }
}
