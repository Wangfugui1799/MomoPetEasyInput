import test from 'node:test';
import assert from 'node:assert/strict';
import {ManualRecording} from '../app/manual-recording.mjs';
test('manual recording preserves silence and multiple phrases until explicit send',()=>{
  const r=new ManualRecording(20);r.start();const first=new Float32Array([.2,.3]);r.push(first);first.fill(1);
  r.push(new Float32Array(4));r.push(new Float32Array([.4]));r.pause();r.push(new Float32Array([.8]));
  assert.deepEqual(r.take(),new Float32Array([.2,.3,0,0,0,0,.4]));assert.equal(r.length,0);
});
test('manual recording caps memory, discards cancellation and starts fresh',()=>{
  const r=new ManualRecording(4);r.start();r.push(new Float32Array(4));assert.equal(r.push(new Float32Array(1)),false);assert.equal(r.length,4);
  r.clear();assert.equal(r.take().length,0);r.start();r.push(new Float32Array([.1]));assert.equal(r.take().length,1);
});
