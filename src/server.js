import dns from 'node:dns'; import { app } from './app.js'; import { connectDatabase } from './config/database.js'; import { env } from './config/env.js';
if(!process.env.VERCEL&&env.MONGODB_DNS_SERVERS.trim()) dns.setServers(env.MONGODB_DNS_SERVERS.split(',').map(server=>server.trim()).filter(Boolean));
async function seedConfiguredAdmin(){
  if(!env.ADMIN_EMAIL||!env.ADMIN_PASSWORD) return;
  const {User,Company,LeaveType}=await import('./models/index.js');
  if(await User.exists({role:'ADMIN'})) return;
  if(!await Company.exists()) await Company.create({name:'HCM Lite'});
  await User.create({email:env.ADMIN_EMAIL,passwordHash:await (await import('bcryptjs')).default.hash(env.ADMIN_PASSWORD,12),role:'ADMIN'});
  if(!await LeaveType.exists()) await LeaveType.create([{name:'Annual leave',code:'annual',quota:14},{name:'Sick leave',code:'sick',quota:8},{name:'Casual leave',code:'casual',quota:10},{name:'Unpaid leave',code:'unpaid',unpaid:true}]);
}
if(!process.env.VERCEL){
  await connectDatabase();
  await seedConfiguredAdmin();
  app.listen(env.PORT,()=>console.log(`HCM Lite API listening on ${env.PORT}`));
}
export default app;
