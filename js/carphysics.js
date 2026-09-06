/* ===================== CAR PHYSICS =====================
   A dependency-free port of the 2D rigid-body car model from oseiskar/js-car
   (GitHub, MIT license): https://github.com/oseiskar/js-car/blob/master/physics/car.js

   That project's own README frames the approach as treating the car as a rigid
   body with two friction contacts (front axle center, rear axle center) instead
   of four separate wheels — "a motorcycle that does not bank." Each frame it
   solves for the exact front/rear contact forces that satisfy the no-slip
   (rolling, non-sliding) constraint at both axles simultaneously, then checks
   whether either force exceeds that axle's friction limit; if it does, that
   axle slips and its force is capped at the (lower) dynamic-friction limit
   instead, which is what produces real cornering slides at speed and losing
   grip on a too-sharp turn — not a scripted "turn slower when fast" rule, an
   emergent result of the constraint solve.

   The original uses mathjs for its matrix ops (2x2 solves, matrix inverse).
   Nothing here actually needs a general linear-algebra library: the mass/
   inertia matrix is diagonal (trivial to invert by hand) and the coupled
   front/rear solve is a plain 2x2 system, solved below with Cramer's rule.
   Removing that dependency is the only thing "ported" rather than vendored
   verbatim — every equation (steering geometry, no-slip solve, slip fallback,
   air drag) is the same as the source. Kept dependency-free on purpose: this
   app has no build step and no npm dependencies anywhere else (see CLAUDE.md).

   2D here maps to the ground plane: physics [x,y] <-> world (x,z). rot=0 means
   facing world -x historically in the source demo; CarPhysics below stores rot
   in the SAME frame game.js's yaw already uses (forward = (sin(yaw),cos(yaw))
   in world (x,z)) via a fixed change of basis, so nothing outside this file
   needs to know the difference. */

/* ---- tiny 2-vector helpers (replace the mathjs calls in the source) ---- */
const V2 = {
  add:(a,b)=>[a[0]+b[0],a[1]+b[1]],
  sub:(a,b)=>[a[0]-b[0],a[1]-b[1]],
  scale:(a,s)=>[a[0]*s,a[1]*s],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1],
  cross:(a,b)=>a[0]*b[1]-a[1]*b[0],
  norm:a=>Math.hypot(a[0],a[1]),
  normalize:a=>{ const n=Math.hypot(a[0],a[1]); return n>1e-9?[a[0]/n,a[1]/n]:[0,0]; },
  rot90cw:a=>[a[1],-a[0]],
  rot90ccw:a=>[-a[1],a[0]]
};
function clampAbs(x,max){ return Math.max(-max,Math.min(max,x)); }

function CarPhysics(opts){
  opts=opts||{};
  const length=opts.length||9.4, width=opts.width||3.9, mass=opts.mass||1000;
  const gravity=9.81;
  const MoI=(1/12)*(length*length+width*width)*mass;
  const minTurningRadius=opts.minTurningRadius||length;

  // NOTE on tuning: the source's own maxThrust formula (mass*thrustFrac*gravity*0.5)
  // and its friction-based slip check aren't independent — the slip check compares
  // the BACK axle's total force (wheel reaction force *plus* thrust, since thrust is
  // applied there) against mass*gravity*staticFriction/2. Pick a thrustFrac at or
  // above staticFriction and the rear tires are permanently past their grip limit
  // under any throttle, i.e. permanent wheelspin, and every straight-line frame gets
  // force-capped at the much lower maxForceSlip instead of the requested thrust
  // (found by simulating it: the car topped out around 2 units/s instead of the
  // ~14 this was tuned for). Keeping thrustFrac safely under staticFriction keeps
  // the car in its no-slip regime under straight acceleration; dragFrac then sets
  // the top speed via thrustFrac*gravity*0.5/dragFrac. Cornering hard at speed can
  // still trigger the same slip path — that's the model doing its job, not this bug.
  const c=this.properties={
    mass, MoI, length, width, gravity,
    airResistance: mass*(opts.dragFrac!==undefined?opts.dragFrac:0.42),
    staticFriction: opts.staticFriction!==undefined?opts.staticFriction:1.35,
    dynamicFriction: opts.dynamicFriction!==undefined?opts.dynamicFriction:0.45,
    wheelTurnSpeed: opts.wheelTurnSpeed!==undefined?opts.wheelTurnSpeed:2.6,
    maxWheelAngle: Math.atan(length/minTurningRadius),
    maxThrust: mass*(opts.thrustFrac!==undefined?opts.thrustFrac:1.2)*gravity*0.5
  };

  this.pos=[0,0];        // world (x,z)
  this.rot=0;            // radians; forward = (sin(rot), cos(rot)) in world (x,z) — same convention as game.js's yaw
  this.v=[0,0];
  this.vrot=0;
  this.wheelAngle=0;
  this.slip={front:false,back:false};

  // forward/right expressed directly in game.js's (x,z)-as-yaw convention,
  // so the rest of this file never has to think about the source's own
  // (cos,sin)-from-+x convention at all
  this.getForwardDir=()=>[Math.sin(this.rot),Math.cos(this.rot)];

  this.getSpeed=()=>V2.norm(this.v);

  this.move=(dt,controls)=>{
    if(dt<=0||dt>1) return;
    const v0=[this.v[0],this.v[1],this.vrot];

    const fwd=this.getForwardDir();
    const right=V2.rot90cw(fwd);
    const back=V2.scale(fwd,-length*0.5);
    const front=V2.scale(fwd,length*0.5);

    const turnSpeed=clampAbs(controls.wheelTurnSpeed||0,c.wheelTurnSpeed);
    this.wheelAngle=clampAbs(this.wheelAngle+turnSpeed*dt,c.maxWheelAngle);

    let frontWheelAxis=right;
    if(this.wheelAngle!==0){
      const turningRadius=length/Math.tan(this.wheelAngle);
      const turningCenter=V2.add(back,V2.scale(right,turningRadius));
      frontWheelAxis=V2.normalize(V2.sub(turningCenter,front));
    }
    const backWheelAxis=right;

    const thrust=clampAbs(controls.throttle||0,1)*c.maxThrust;
    const thrustForce=V2.scale(fwd,thrust);
    const externalForces=V2.scale(this.v,-c.airResistance);   // linear air drag

    // The coupled 2x2 no-slip solve: the exact front/rear contact forces that
    // keep both axle centers from sliding sideways this frame, given every
    // other force already acting on the car (drag + engine thrust, which acts
    // directly on the body — see the file header on why thrust isn't itself
    // friction-limited in this model).
    const solveForcesNoSlip=()=>{
      const kf=(dt/c.MoI)*V2.cross(front,frontWheelAxis);
      const kb=(dt/c.MoI)*V2.cross(back,backWheelAxis);
      const rvF=V2.rot90ccw(front), rvB=V2.rot90ccw(back);
      const dtM=dt/c.mass;

      const aFF=dtM*V2.dot(frontWheelAxis,frontWheelAxis)+kf*V2.dot(frontWheelAxis,rvF);
      const aFB=dtM*V2.dot(frontWheelAxis,backWheelAxis)+kb*V2.dot(frontWheelAxis,rvF);
      const aBF=dtM*V2.dot(backWheelAxis,frontWheelAxis)+kf*V2.dot(backWheelAxis,rvB);
      const aBB=dtM*V2.dot(backWheelAxis,backWheelAxis)+kb*V2.dot(backWheelAxis,rvB);

      const F0perMdt=V2.scale(V2.add(externalForces,thrustForce),dtM);
      const bFront=-V2.dot(frontWheelAxis,V2.add(V2.add(F0perMdt,this.v),V2.scale(rvF,this.vrot)));
      const bBack=-V2.dot(backWheelAxis,V2.add(V2.add(F0perMdt,this.v),V2.scale(rvB,this.vrot)));

      const det=aFF*aBB-aFB*aBF;
      const forceFront=(bFront*aBB-aFB*bBack)/det;
      const forceBack=(aFF*bBack-bFront*aBF)/det;
      return [V2.scale(frontWheelAxis,forceFront), V2.add(V2.scale(backWheelAxis,forceBack),thrustForce)];
    };

    const solveForcesSemiSlip=(point,axis,externalF,externalT)=>{
      const dtM=dt/c.mass;
      const kt=(dt/c.MoI)*V2.cross(point,axis);
      const rv=V2.rot90ccw(point);
      const a=dtM+kt*V2.dot(axis,rv);
      const F0perMdt=V2.scale(externalF,dtM);
      const bb=-V2.dot(axis,V2.add(V2.add(F0perMdt,this.v),V2.scale(rv,this.vrot+dt*externalT/c.MoI)));
      return V2.scale(axis,bb/a);
    };

    const solveForces=()=>{
      const backFriction=this.slip.back?c.dynamicFriction:c.staticFriction;
      const frontFriction=this.slip.front?c.dynamicFriction:c.staticFriction;
      const maxForceBack=c.mass*c.gravity*backFriction/2;
      const maxForceFront=c.mass*c.gravity*frontFriction/2;

      let [forceFront,forceBack]=solveForcesNoSlip();
      this.slip.back=V2.norm(forceBack)>maxForceBack;
      this.slip.front=V2.norm(forceFront)>maxForceFront;

      if(this.slip.back||this.slip.front){
        const maxForceSlip=c.mass*c.gravity*c.dynamicFriction/2;
        const backSlippy=V2.scale(V2.normalize(forceBack),maxForceSlip);
        const frontSlippy=V2.scale(V2.normalize(forceFront),maxForceSlip);
        forceFront=frontSlippy; forceBack=backSlippy;

        if(this.slip.back&&!this.slip.front){
          forceFront=solveForcesSemiSlip(front,frontWheelAxis,V2.add(backSlippy,externalForces),V2.cross(back,backSlippy));
          this.slip.front=V2.norm(forceFront)>maxForceFront;
          if(this.slip.front) forceFront=frontSlippy;
        } else if(this.slip.front&&!this.slip.back){
          forceBack=solveForcesSemiSlip(back,backWheelAxis,V2.add(frontSlippy,externalForces),V2.cross(front,frontSlippy));
          this.slip.back=V2.norm(forceBack)>maxForceBack;
          if(this.slip.back) forceBack=backSlippy;
        }
      }
      return [forceFront,forceBack];
    };

    const [forceFront,forceBack]=solveForces();
    const totalForce=V2.add(externalForces,V2.add(forceFront,forceBack));
    const totalTorque=V2.cross(front,forceFront)+V2.cross(back,forceBack);

    this.pos=V2.add(this.pos,V2.scale(this.v,dt));
    this.rot+=this.vrot*dt;

    this.v=[v0[0]+totalForce[0]*dt/c.mass, v0[1]+totalForce[1]*dt/c.mass];
    this.vrot=v0[2]+totalTorque*dt/c.MoI;
  };
}
