export function haversineMeters(lat1, lon1, lat2, lon2) {
  const rad=value=>value*Math.PI/180,earthRadius=6371000;
  const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return earthRadius*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
