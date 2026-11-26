// The worked example holds the demo at 18° incidence and zero yaw.
const speedControl=document.getElementById('example-speed');
function updateExample(){
  const speed=speedControl.valueAsNumber;
  const pressure=.5*1.225*speed**2;
  const wingLoad=.95,area=1.50;
  const drag=pressure*area*(.765+.145*wingLoad**2);
  const downforce=pressure*area*(2.17+wingLoad);
  document.getElementById('example-speed-value').value=speed+' m/s';
  document.getElementById('example-q').textContent=pressure.toLocaleString('en-US',{maximumFractionDigits:0});
  document.getElementById('example-re').textContent=(1.225*speed*5.50/1.81e-5/1e6).toFixed(2);
  document.getElementById('example-drag').textContent=(drag/1000).toFixed(2);
  document.getElementById('example-load').textContent=(downforce/1000).toFixed(2);
}
speedControl.addEventListener('input',updateExample);
updateExample();
