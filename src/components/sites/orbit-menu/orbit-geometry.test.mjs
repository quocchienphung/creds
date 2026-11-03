import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orbitPoints, orbitTarget, fitOrbit } from './orbit-geometry.ts';

test('observed 104px/150° fan has the source five action centers', () => {
  const points = orbitPoints(5);
  assert.ok(Math.abs(points[0].x + 100.456) < .001);
  assert.ok(Math.abs(points[0].y + 26.917) < .001);
  assert.ok(Math.abs(points[2].x) < 1e-10);
  assert.equal(points[2].y, -104);
  assert.ok(Math.abs(points[4].x - 100.456) < .001);
});

test('pie targeting accepts a direction without requiring a circle hit', () => {
  assert.equal(orbitTarget({x:0,y:-38},5),2);
  assert.equal(orbitTarget({x:-50,y:-15},5),0);
  assert.equal(orbitTarget({x:0,y:-33},5),-1);
  assert.equal(orbitTarget({x:0,y:100},5),-1);
  assert.equal(orbitTarget({x:0,y:-100},0),-1);
});

test('targeting rotates correctly through the angle discontinuity', () => {
  assert.equal(orbitTarget({x:-100,y:1},5,150,180),2);
  assert.equal(orbitTarget({x:-100,y:-1},5,150,180),2);
  assert.equal(orbitTarget({x:100,y:0},5,150,180),-1);
});

test('a top edge flips the fan into available space', () => {
  const boundary={left:0,top:0,right:1000,bottom:700};
  const origin={x:500,y:32};
  const fitted=fitOrbit(origin,6,boundary);
  for(const point of orbitPoints(6,fitted.radius,fitted.spread,fitted.direction)){
    assert.ok(origin.x+point.x-23>=boundary.left);
    assert.ok(origin.y+point.y-23>=boundary.top);
    assert.ok(origin.x+point.x+23<=boundary.right);
    assert.ok(origin.y+point.y+23<=boundary.bottom);
  }
});

test('inspector boundary rotates the fan away from the right panel', () => {
  const boundary={left:240,top:150,right:1050,bottom:800};
  const origin={x:1020,y:400};
  const fitted=fitOrbit(origin,6,boundary);
  for(const point of orbitPoints(6,fitted.radius,fitted.spread,fitted.direction)) assert.ok(origin.x+point.x+23<=boundary.right);
});

test('narrow corner fans retain separated 46px targets', () => {
  const origin={x:32,y:32};
  const fitted=fitOrbit(origin,6,{left:8,top:8,right:382,bottom:800});
  const points=orbitPoints(6,fitted.radius,fitted.spread,fitted.direction);
  for(let index=0;index<points.length;index++){
    assert.ok(origin.x+points[index].x-23>=8-0.001);
    assert.ok(origin.y+points[index].y-23>=8-0.001);
    if(index) assert.ok(Math.hypot(points[index].x-points[index-1].x,points[index].y-points[index-1].y)>=49.99);
  }
});
