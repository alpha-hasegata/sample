/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * 座標生成（ブルーノイズ/jittered grid）を行う。また同時に山頂Indexを生成する
 *
 *
 * Points are regions (r), and either come from a jittered hexagonal
 * grid or a precomputed blue noise set. Mountain peaks are triangles
 * (t), and either come from a random subset of triangles or from a
 * non-random subset of the blue noise points. However, since the blue
 * noise points are regions and mountain peaks are triangles, I
 * arbitrarily pick one triangle from each region.
 *
 * The precomputed points are read from the network, so the module
 * uses async functions that build the mesh only after the points are
 * read in.
 */
'use strict';

const param       = require('./config');
const DualMesh    = require('@redblobgames/dual-mesh');
const MeshBuilder = require('@redblobgames/dual-mesh/create');
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');


/**
 * @typedef { import("./types").Mesh } Mesh
 */


/**
 * 座標に円状の揺らぎを与える.
 *
 * @param {number[][]} points
 * @param {number} dr
 * @param {function(): number} randFloat
 */
function applyJitter(points, dr, randFloat) {
    let newPoints = [];
    for (let p of points) {
        let r = dr * Math.sqrt(Math.abs(randFloat()));
        let a = Math.PI * randFloat();
        let dx = r * Math.cos(a);
        let dy = r * Math.sin(a);
        newPoints.push([p[0] + dx, p[1] + dy]);
    }

    return newPoints;
}

/**
 * ※メッシュ座標群をファイルから取得する限りは使わない
 *
 * Generate a hexagonal grid with a given spacing. This is used when NOT
 * reading points from a file.
 *
 * @param {number} spacing - horizontal spacing between adjacent hexagons
 * @returns {[number, number][]} - list of [x, y] points
 */
function hexagonGrid(spacing) {
    let points = /** @type{[number, number][]} */([]);
    let offset = 0;
    for (let y = spacing/2; y < 1000-spacing/2; y += spacing * 3/4) {
        offset = (offset === 0)? spacing/2 : 0;
        for (let x = offset + spacing/2; x < 1000-spacing/2; x += spacing) {
            points.push([x, y]);
        }
    }
    return points;
}

/**
 * ※メッシュ座標群をファイルから取得する限りは使わない
 *
 * Choose a random set of regions for mountain peaks. This is used
 * when NOT reading points from a file.
 *
 * @param {number} numPoints
 * @param {number} spacing - param.spacing parameter, used to calculate density
 * @param {function(): number} randFloat - random number generator (0-1)
 * @returns {number[]} - array of point indices
 */
function chooseMountainPeaks(numPoints, spacing, randFloat) {
    const fractionOfPeaks = spacing*spacing / param.mountainDensity;
    let peaks_r = [];
    for (let r = 0; r < numPoints; r++) {
        if (randFloat() < fractionOfPeaks) {
            peaks_r.push(r);
        }
    }
    return peaks_r;
}

/**
 * 事前に生成したファイルからメッシュ座標群及び山のインデックス群を読み込む。
 *
 * The points are [x,y]; the peaks in the index are an index into the
 * points[] array, *not* region ids. The mesh creation process can
 * insert new regions before and after this array, so these indices
 * have to be adjusted later.
 *
 * @param {ArrayBuffer} buffer - data read from the mesh file
 * @returns {{points: メッシュ座標群number[][], 山インデックス群peaks_index: number[]}}
 */
function extractPoints(buffer) {
    // 以下のフォーマットのファイルを読み込む
    // 　[0]:山インデックスの数
    // 　[1]～[山インデックスの数]：山インデックスの実値
    // 　[山インデックスの数+1]～[終端]：メッシュの座標群（XとYが交互）
    const pointData = new Uint16Array(buffer);
    
    // 山インデックスの数
    const numMountainPeaks = pointData[0];
    
    // 山インデックスの実値
    let peaks_index = Array.from(pointData.slice(1, 1 + numMountainPeaks));
    
    // メッシュの座標群
    const numRegions = (pointData.length - numMountainPeaks - 1) / 2;
    let points = [];
    for (let i = 0; i < numRegions; i++) {
        let j = 1 + numMountainPeaks + 2*i;
        points.push([pointData[j], pointData[j+1]]);
    }
    
    return {points, peaks_index};
}

/**
 * メッシュ座標及び山用のインデックス群読み込み、もしくは生成。
 * TODO:メッシュ間隔が5の場合にのみ事前に生成したファイルを読み込む。
 * TODO: This hard-codes the spacing of 5; it should be a parameter
 */
async function choosePoints() {
    let points = undefined, peaks_index = undefined;
    const jitter = 0.5;
    if (param.spacing === 5) {
        // 事前に生成したメッシュ座標及び山用のインデックス群を「"build/points-5.data」ファイルから読み込む
        let buffer = await fetch("build/points-5.data").then(response => response.arrayBuffer());
        let extraction = extractPoints(buffer);
        
        // 取得したメッシュ座標群に揺らぎを与える
        points = applyJitter(extraction.points, param.spacing * jitter * 0.5, makeRandFloat(param.mesh.seed));
        peaks_index = extraction.peaks_index;
    } else {
        points = applyJitter(hexagonGrid(1.5 * param.spacing), param.spacing * jitter, makeRandFloat(param.mesh.seed));
        peaks_index = chooseMountainPeaks(points.length, param.spacing, makeRandFloat(param.mesh.seed));
    };
    return {points, peaks_index};
}

/**
 * メッシュ生成
 */
async function makeMesh() {
    // 座標群と山インデックス群取得
    let {points, peaks_index} = await choosePoints();

    // デュアルメッシュライブラリを使用して座標群からメッシュ生成
    let builder = new MeshBuilder({boundarySpacing: param.spacing * 1.5})
        .addPoints(points);
    let mesh = /** @type {Mesh} */(builder.create());
    console.log(`triangles = ${mesh.numTriangles} regions = ${mesh.numRegions}`);

    mesh.s_length = new Float32Array(mesh.numSides);
    for (let s = 0; s < mesh.numSides; s++) {
        let r1 = mesh.s_begin_r(s),
            r2 = mesh.s_end_r(s);
        let dx = mesh.r_x(r1) - mesh.r_x(r2),
            dy = mesh.r_y(r1) - mesh.r_y(r2);
        mesh.s_length[s] = Math.sqrt(dx*dx + dy*dy);
    }

    /* The input points get assigned to different positions in the
     * output mesh. The peaks_index has indices into the original
     * array. This test makes sure that the logic for mapping input
     * indices to output indices hasn't changed. */
    if (points[200][0] !== mesh.r_x(200 + mesh.numBoundaryRegions)
        || points[200][1] !== mesh.r_y(200 + mesh.numBoundaryRegions)) {
        throw "Mapping from input points to output points has changed";
    }
    let peaks_r = peaks_index.map(i => i + mesh.numBoundaryRegions);
    
    let peaks_t = [];
    for (let r of peaks_r) {
        peaks_t.push(mesh.s_inner_t(mesh._r_in_s[r]));
    }
    
    return {mesh, peaks_t};
}


exports.makeMesh = makeMesh;
