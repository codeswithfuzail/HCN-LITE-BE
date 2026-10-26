import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { env } from '../config/env.js';
export async function authenticate(req,res,next) {
  try { const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); if(!token) return res.status(401).json({error:'Authentication required'}); const data=jwt.verify(token,env.JWT_SECRET); const user=await User.findById(data.sub); if(!user||!user.active||user.tokenVersion!==data.ver) return res.status(401).json({error:'Session expired'}); req.user=user; next(); } catch { res.status(401).json({error:'Invalid or expired session'}); }
}
export const roles=(...allowed)=>(req,res,next)=>allowed.includes(req.user.role)?next():res.status(403).json({error:'Access denied'});
export function passwordGate(req,res,next){ if(req.user.mustChangePassword && !req.path.includes('/auth/change-password')) return res.status(428).json({error:'Password change required'}); next(); }
