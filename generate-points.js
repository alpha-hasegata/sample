'use strict';

const fs = require('fs');
const {makeRandFloat} = require('@redblobgames/prng');
const Poisson = require('poisson-disk-sampling');
const {mesh, spacing, mountainSpacing} = require('./config');

const filename = `build/points-${spacing}.data`;

// 山用の座標群を作成する（配置間隔は35）
let mountainPoints = new Poisson([1000, 1000], mountainSpacing, undefined, undefined, makeRandFloat(mesh.seed)).fill();

// 上述の座標群に追加する形で座標群を作成する。（配置間隔は5）
let generator = new Poisson([1000, 1000], spacing, undefined, undefined, makeRandFloat(mesh.seed));
for (let p of mountainPoints) { generator.addPoint(p); }
let meshPoints = generator.fill();

// 座標配列に配列通番を追加する。加えて座標を32bit数値に変換
// この通番は山用の座標群を識別するのに使用する（山用の座標の長さ以下であれば山用の座標）
meshPoints = meshPoints.map((p, i) => [p[0] | 0, p[1] | 0, i]);

// x,yの優先順で座標を降順ソート
meshPoints.sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);

// 山用座標のmeshPointsにおけるインデックス群を生成
let mountainIndices = [];
for (let i = 0; i < meshPoints.length; i++) {
    if (meshPoints[i][2] < mountainPoints.length) {
        mountainIndices.push(i);
    }
}

// 以下の情報を一次元配列で出力する
// ・山用座標の数
// ・山用座標のインデックス群
// ・全座標情報（XとYは連番で出力する。※flat[1000]がX,flat[1001]がYといった感じ）
let flat = [mountainPoints.length].concat(mountainIndices);
for (let p of meshPoints) {
    flat.push(p[0], p[1]);
}

//fs.writeFileSync(filename, Uint16Array.from(flat));
console.log(flat);

