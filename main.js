'use strict';
const unique = require('uniq');
const fs = require('fs');
const {makeRandFloat} = require('@redblobgames/prng');
const Poisson = require('poisson-disk-sampling');
const {mesh, spacing, mountainSpacing} = require('./config');

const filename = `build/points-${spacing}.data`;

/* First generate the mountain points */
let points = new Poisson([1000, 1000], mountainSpacing, undefined, undefined, makeRandFloat(mesh.seed)).fill();


var data = [1, 2, 2, 3, 4, 5, 5, 5, 6];

console.log(unique(data));
console.log("HelloWorld2");

console.log(points)

/*
var points = [
  [2, 88],
  [2, 2],
  [68, 52]
];
*/
points = points.map((p, i) => [p[0] | 0, p[1] | 0, i]);
points.sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);

console.log(points);
