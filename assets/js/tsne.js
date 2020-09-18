// HUILLCA
var colors_cluster = [[1/255, 183/255, 1/255],
                      [234/255, 1/255, 1/255],
                      [1/255, 1/255, 232/255],
                      [234/255, 1/255, 85/255],
                      [234/255, 183/255, 1/255],
                      [34/255, 183/255, 1/255],
                      [234/255, 12/255, 123/255],
                      [125/255, 183/255, 15/255],
                    ];

function Config() {
  this.data = {
    dir: 'data',
    file: 'manifest.json',
  }
  this.size = {
    cell: 32, // height of each cell in atlas
    lodCell: 128, // height of each cell in LOD
    atlas: 2048, // height of each atlas
    texture: webgl.limits.textureSize, // 8192 HUILLCA ---
    lodTexture: 2**13,
    points: {
      min: 0, // min point size
      max: 0, // max point size
      initial: 0, // initial point size
      grid: 0, // initial point size for grid layouts
      scatter: 0, // initial point size for scatter layouts
      date: 0, // initial point size for date layouts
    },
  }
  this.transitions = {
    duration: 3.0,
    delay: 1.0,
  }
  this.transitions.ease = {
    value: 1.0 + this.transitions.delay,
    ease: Power3.easeOut, // HUILLCA
  }
  this.pickerMaxZ = 0.4; // max z value of camera to trigger picker modal
  this.atlasesPerTex = (this.size.texture/this.size.atlas)**2;
}

/**
* Data: Container for data consumed by application
*
* atlasCount: total number of atlases to load; specified in config.data.file
* textureCount: total number of textures to create
* textures: array of Texture objects to render. Each requires a draw call
* layout: string layout for the currently active layout in json.layouts
* layouts: array of layouts, each with 2 or 3D positional attributes per cell
* cells: array of images to render. Each depicts a single input image
* textureProgress: maps texture index to its loading progress (0:100)
* textureCount: total number of textures to load
* loadedTextures: number of textures loaded so far
* boundingBox: the domains for the x and y axes. Used for setting initial
*   camera position and creating the LOD grid
**/

function Data() {
  this.atlasCount = null;
  this.textureCount = null;
  this.layouts = [];
  this.cells = [];
  this.textures = [];
  this.textureProgress = {};
  this.loadedTextures = 0;
  this.boundingBox = {
    x: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, },
    y: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, },
  };
  world.getHeightMap(this.load.bind(this)); // HUILLCA --
}

// Load json data with chart element positions
Data.prototype.load = function() {
  get(getPath(config.data.dir + '/' + config.data.file),
    function(json) {
      console.log(' **line119:', json)  // HUILLCA
      get(getPath(json.imagelist), function(data) {
        this.parseManifest(Object.assign({}, json, data));
      }.bind(this))
    }.bind(this),
    function(err) {
      console.warn('ERROR: could not load manifest.json')
    }.bind(this)
  )
}

Data.prototype.parseManifest = function(json) {
  this.json = json;
  // set sizes of cells, atlases, and points
  config.size.cell = json.config.sizes.cell;
  config.size.atlas = json.config.sizes.atlas;
  config.size.lodCell = json.config.sizes.lod;
  config.size.points = json.point_sizes;
  // update the point size DOM element
  world.elems.pointSize.min = 0;
  world.elems.pointSize.max = config.size.points.max;
  world.elems.pointSize.value = config.size.points.initial;
  // set number of atlases and textures
  this.atlasCount = json.atlas.count;
  this.textureCount = Math.ceil(json.atlas.count / config.atlasesPerTex);
  this.layouts = json.layouts;
  this.hotspots = new Hotspots();
  layout.init(Object.keys(this.layouts));
  // load the filter options if metadata present
  if (json.metadata) filters.loadFilters();
  // load each texture for this data set
  for (var i=0; i<this.textureCount; i++) {
    this.textures.push(new Texture({
      idx: i,
      onProgress: this.onTextureProgress.bind(this),
      onLoad: this.onTextureLoad.bind(this),
    }));
  };
  // add cells to the world
  get(getPath(this.layouts[layout.selected].layout), this.addCells.bind(this))
}

// When a texture's progress updates, update the aggregate progress
Data.prototype.onTextureProgress = function(texIdx, progress) {
  this.textureProgress[texIdx] = progress / this.textures[texIdx].getAtlasCount(texIdx);
  welcome.updateProgress();
}

// When a texture loads, draw plot if all have loaded
Data.prototype.onTextureLoad = function(texIdx) {
  this.loadedTextures += 1;
  welcome.updateProgress();
}

// Add all cells to the world
Data.prototype.addCells = function(positions) {

  console.log(' **json185: ', this.json)
  // datastore indicating data in current draw call
  var drawcall = {
    idx: 0, // idx of draw call among all draw calls
    textures: [], // count of textures in current draw call
    vertices: 0, // count of vertices in current draw call
  }
  // create all cells
  var idx = 0; // index of cell among all cells
  for (var i=0; i<this.json.cell_sizes.length; i++) { // atlas index
    for (var j=0; j<this.json.cell_sizes[i].length; j++) { // cell index within atlas
      drawcall.vertices++;
      var texIdx = Math.floor(i/config.atlasesPerTex),
          worldPos = positions[idx], // position of cell in world -1:1
          atlasPos = this.json.atlas.positions[i][j], // idx-th cell position in atlas
          atlasOffset = getAtlasOffset(i),
          size = this.json.cell_sizes[i][j],
          cluster_id = this.json.cluster_ids[i][j]; // HUILLCA
      this.cells.push(new Cell({
        idx: idx, // index of cell among all cells
        w:  size[0], // width of cell in lod atlas
        h:  size[1], // height of cell in lod atlas
        x:  worldPos[0], // x position of cell in world
        y:  worldPos[1], // y position of cell in world
        z:  worldPos[2] || null, // z position of cell in world
        dx: atlasPos[0] + atlasOffset.x, // x offset of cell in atlas
        dy: atlasPos[1] + atlasOffset.y, // y offset of cell in atlas
        clusId: cluster_id, // HUILLCA : 0-based id cluster
      }))
      idx++;
    }
  }
  // add the cells to a searchable LOD texture
  // lod.indexCells();
}

// ------------------------------------------------------------------------------------------------------------

/**
* Hotspots
**/

function Hotspots() {
  this.template = document.querySelector('#hotspot-template');
  this.target = document.querySelector('#hotspots');
  this.init();
}

Hotspots.prototype.init = function() {
  get(getPath(data.json.centroids), function(json) {
    this.json = json;
    this.target.innerHTML = _.template(this.template.innerHTML)({
      hotspots: this.json,
    });
    //console.log('LODASH: ', this.target.innerHTML)
    var hotspots = document.querySelectorAll('.hotspot');
    for (var i=0; i<hotspots.length; i++) {
      hotspots[i].addEventListener('click', function(idx) {
        world.flyToCellImage(data.hotspots.json[idx].img); // HUILLCA solo seria this.json[idx]
      }.bind(this, i))
    }
  }.bind(this))
}

Hotspots.prototype.showHide = function() {
  c = ['umap'].indexOf(layout.selected) > -1 ? '' : 'disabled';
  document.querySelector('nav').className = c;
}


// ------------------------------------------------------------------------------------------------------------

/**
* Texture: Each texture contains one or more atlases, and each atlas contains
*   many Cells, where each cell represents a single input image.
*
* idx: index of this texture within all textures
* cellIndices: indices of the cells in this texture within data.cells
* atlasProgress: map from this textures atlas id's to their load progress (0:100)
* atlases: list of atlases used in this texture
* atlasCount: number of atlases to load for this texture
* onProgress: callback to tell Data() that this texture loaded a bit more
* onLoad: callback to tell Data() that this texture finished loading
* loadedAtlases: number of atlases loaded
* canvas: the canvas on which each atlas in this texture will be rendered
* ctx: the 2D context for drawing on this.canvas
* offscreen: boolean indicating whether this canvas can be drawn offscreen
*   (unused)
**/

function Texture(obj) {
  this.idx = obj.idx;
  this.atlases = [];
  this.atlasProgress = {};
  this.loadedAtlases = 0;
  this.onProgress = obj.onProgress;
  this.onLoad = obj.onLoad;
  this.canvas = null;
  this.ctx = null;
  this.load();
}

Texture.prototype.setCanvas = function() {
  this.canvas = getElem('canvas', {
    width: config.size.texture,
    height: config.size.texture,
    id: 'texture-' + this.idx,
  })
  this.ctx = this.canvas.getContext('2d');
}

Texture.prototype.load = function() {
  this.setCanvas();
  // load each atlas that is to be included in this texture
  for (var i=0; i<this.getAtlasCount(); i++) {
    this.atlases.push(new Atlas({
      idx: (config.atlasesPerTex * this.idx) + i, // atlas index among all atlases
      onProgress: this.onAtlasProgress.bind(this),
      onLoad: this.onAtlasLoad.bind(this),
    }))
  }
}

// Get the number of atlases to include in this texture
Texture.prototype.getAtlasCount = function() {
  console.log(data.atlasCount, config.atlasesPerTex, data.atlasCount / config.atlasesPerTex, this.idx)
  return (data.atlasCount / config.atlasesPerTex) > (this.idx + 1)
    ? config.atlasesPerTex
    : data.atlasCount % config.atlasesPerTex;
}

// Store the load progress of each atlas file
Texture.prototype.onAtlasProgress = function(atlasIdx, progress) {
  this.atlasProgress[atlasIdx] = progress;
  var textureProgress = valueSum(this.atlasProgress);
  this.onProgress(this.idx, textureProgress);
}

// Draw the loaded atlas image to this texture's canvas
Texture.prototype.onAtlasLoad = function(atlas) {
  // Add the loaded atlas file the texture's canvas
  var atlasSize = config.size.atlas,
      textureSize = config.size.texture,
      // atlas index within this texture
      idx = atlas.idx % config.atlasesPerTex,
      // x and y offsets within texture
      d = getAtlasOffset(idx),
      w = config.size.atlas,
      h = config.size.atlas;
  this.ctx.drawImage(atlas.image, d.x, d.y, w, h);  // HUILLCA **
  // If all atlases are loaded, build the texture
  if (++this.loadedAtlases == this.getAtlasCount()) this.onLoad(this.idx);
}

// given idx of atlas among all atlases, return offsets of atlas in texture
function getAtlasOffset(idx) {  // HUILLCA : llamado tres veces en diferentes clases
  var atlasSize = config.size.atlas,
      textureSize = config.size.texture;
  return {
    x: (idx * atlasSize) % textureSize,
    y: (Math.floor((idx * atlasSize) / textureSize) * atlasSize) % textureSize,
  }
}

// ------------------------------------------------------------------------------------------------------------

/**
* Atlas: Each atlas contains multiple Cells, and each Cell represents a single
*   input image.
*
* idx: index of this atlas among all atlases
* texIdx: index of this atlases texture among all textures
* cellIndices: array of the indices in data.cells to be rendered by this atlas
* size: height & width of this atlas (in px)
* progress: total load progress for this atlas's image (0-100)
* onProgress: callback to notify parent Texture that this atlas has loaded more
* onLoad: callback to notify parent Texture that this atlas has finished loading
* image: Image object with data to be rendered on this atlas
* url: path to the image for this atlas
* cells: list of the Cell objects rendered in this atlas
* posInTex: the x & y offsets of this atlas in its texture (in px) from top left
**/

function Atlas(obj) {
  this.idx = obj.idx;
  this.progress = 0;
  this.onProgress = obj.onProgress;
  this.onLoad = obj.onLoad;
  this.image = null;
  this.url = getPath(data.json.atlas_dir + '/atlas-' + this.idx + '.jpg');
  this.load();
}

Atlas.prototype.load = function() {
  this.image = new Image;
  this.image.onload = function() { this.onLoad(this); }.bind(this)
  var xhr = new XMLHttpRequest();
  xhr.onprogress = function(e) {
    var progress = parseInt((e.loaded / e.total) * 100);
    this.onProgress(this.idx, progress);
  }.bind(this);
  xhr.onload = function(e) {
    this.image.src = window.URL.createObjectURL(e.target.response);
  }.bind(this);
  xhr.open('GET', this.url, true);
  xhr.responseType = 'blob';
  xhr.send();
}

// ------------------------------------------------------------------------------------------------------------

/**
* Assess WebGL parameters
**/

function Webgl() {
  this.gl = this.getGl();
  this.limits = this.getLimits();
}

/**
* Get a WebGL context, or display an error if WebGL is not available
**/

Webgl.prototype.getGl = function() {
  var gl = getElem('canvas').getContext('webgl');
  if (!gl) document.querySelector('#webgl-not-available').style.display = 'block';
  return gl;
}

/**
* Get the limits of the user's WebGL context
**/

Webgl.prototype.getLimits = function() {
  // fetch all browser extensions as a map for O(1) lookups
  var extensions = this.gl.getSupportedExtensions().reduce(function(obj, i) {
    obj[i] = true; return obj;
  }, {})
  // assess support for 32-bit indices in gl.drawElements calls
  var maxIndex = 2**16 - 1;
  ['', 'MOZ_', 'WEBKIT_'].forEach(function(ext) {
    if (extensions[ext + 'OES_element_index_uint']) maxIndex = 2**32 - 1;
  })
  // for stats see e.g. https://webglstats.com/webgl/parameter/MAX_TEXTURE_SIZE
  return {
    // max h,w of textures in px
    textureSize: Math.min(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE), 2**13),
    // max textures that can be used in fragment shader
    textureCount: this.gl.getParameter(this.gl.MAX_TEXTURE_IMAGE_UNITS),
    // max textures that can be used in vertex shader
    vShaderTextures: this.gl.getParameter(this.gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    // max number of indexed elements
    indexedElements: maxIndex,
  }
}


// ------------------------------------------------------------------------------------------------------------

/**
* Cell: Each cell represents a single input image.
*
* idx: index of this cell among all cells
* name: the basename for this image (e.g. cats.jpg)
* w: the width of this image in pixels
* h: the height of this image in pixels
* gridCoords: x,y coordinates of this image in the LOD grid -- set by LOD()
* layouts: a map from layout name to obj with x, y, z positional values
**/

function Cell(obj) {
  this.idx = obj.idx; // idx among all cells
  this.texIdx = this.getIndexOfTexture();
  this.gridCoords = {}; // x, y pos of the cell in the lod grid (set by lod)
  this.x = obj.x;
  this.y = obj.y;
  this.z = obj.z || this.getZ(obj.x, obj.y);
  this.tx = this.x; // target x position
  this.ty = this.y; // target y position
  this.tz = this.z; // target z position
  this.dx = obj.dx;
  this.dy = obj.dy;
  this.w = obj.w; // width of lod cell
  this.h = obj.h; // heiht of lod cell
  this.clusId = obj.clusId; // HUILLCA
  this.updateParentBoundingBox();
}

Cell.prototype.getZ = function(x, y) {
  return world.getHeightAt(x, y) || 0;
}

Cell.prototype.updateParentBoundingBox = function() {
  var bb = data.boundingBox;
  ['x', 'y'].forEach(function(d) {
    bb[d].max = Math.max(bb[d].max, this[d]);
    bb[d].min = Math.min(bb[d].min, this[d]);
  }.bind(this))
}

// return the index of this atlas among all atlases
Cell.prototype.getIndexOfAtlas = function() {
  var i=0; // accumulate cells per atlas until we find this cell's atlas
  for (var j=0; j<data.json.atlas.positions.length; j++) {
    i += data.json.atlas.positions[j].length;
    if (i > this.idx) return j;
  }
  return j;
}

// return the index of this cell within its atlas
Cell.prototype.getIndexInAtlas = function() {
  var atlasIdx = this.getIndexOfAtlas();
  var i=0; // determine the number of cells in all atlases prior to current
  for (var j=0; j<atlasIdx; j++) {
    i += data.json.atlas.positions[j].length;
  }
  return this.idx - i;
}

// return the index of this cell's initial (non-lod) texture among all textures
Cell.prototype.getIndexOfTexture = function() {
  return Math.floor(this.getIndexOfAtlas() / config.atlasesPerTex);
}

// return the index of this cell among cells in its initial (non-lod) texture
Cell.prototype.getIndexInTexture = function() {
  var i=0; // index of starting cell in atlas within texture
  for (var j=0; j<this.getIndexOfAtlas(); j++) {
    if ((j%config.atlaesPerTex)==0) i = 0;
    i += data.json.atlas.positions[i].length;
  }
  return i + this.getIndexInAtlas();
}

// return the index of this cell's draw call among all draw calls
Cell.prototype.getIndexOfDrawCall = function() {
  return Math.floor(this.idx/webgl.limits.indexedElements);
}

// return the index of this cell within its draw call
Cell.prototype.getIndexInDrawCall = function() {
  return this.idx % webgl.limits.indexedElements;
}

/**
* Cell activation / deactivation
**/

// make the cell active in LOD
Cell.prototype.activate = function() {
  this.dx = lod.state.cellIdxToCoords[this.idx].x;
  this.dy = lod.state.cellIdxToCoords[this.idx].y;
  this.texIdx = -1;
  ['textureIndex', 'offset'].forEach(this.setBuffer.bind(this));
}

// deactivate the cell in LOD
Cell.prototype.deactivate = function() {
  var atlasIndex = this.getIndexOfAtlas(),
      indexInAtlas = this.getIndexInAtlas(),
      atlasOffset = getAtlasOffset(atlasIndex)
      d = data.json.atlas.positions[atlasIndex][indexInAtlas];
  this.dx = d[0] + atlasOffset.x;
  this.dy = d[1] + atlasOffset.y;
  this.texIdx = this.getIndexOfTexture();
  ['textureIndex', 'offset'].forEach(this.setBuffer.bind(this));
}

// update this cell's buffer values for bound attribute `attr`
Cell.prototype.setBuffer = function(attr) {
  // find the buffer attributes that describe this cell to the GPU
  var meshes = world.group,
      attrs = meshes.children[this.getIndexOfDrawCall()].geometry.attributes,
      idxInDrawCall = this.getIndexInDrawCall();

  switch(attr) {
    case 'textureIndex':
      // set the texIdx to -1 to read from the uniforms.lodTexture
      attrs.textureIndex.array[idxInDrawCall] = this.texIdx;
      return;

    case 'offset':
      // find cell's position in the LOD texture then set x, y tex offsets
      var texSize = this.texIdx == -1 ? config.size.lodTexture : config.size.texture;
      // set the x then y texture offsets for this cell
      attrs.offset.array[(idxInDrawCall * 2)] = this.dx;
      attrs.offset.array[(idxInDrawCall * 2) + 1] = this.dy;
      return;

    case 'pos0':
      // set the cell's translation
      attrs.pos0.array[(idxInDrawCall * 3)] = this.x;
      attrs.pos0.array[(idxInDrawCall * 3) + 1] = this.y;
      attrs.pos0.array[(idxInDrawCall * 3) + 2] = this.z;
      return;

    case 'pos1':
      // set the cell's translation
      attrs.pos1.array[(idxInDrawCall * 3)] = this.tx;
      attrs.pos1.array[(idxInDrawCall * 3) + 1] = this.ty;
      attrs.pos1.array[(idxInDrawCall * 3) + 2] = this.tz;
      return;
  }
}

// ------------------------------------------------------------------------------------------------------------

/**
* Layout: contols the DOM element and state that identify the layout
*   to be displayed
*
* elem: DOM element for the layout selector
* jitterElem: DOM element for the jitter selector
* selected: currently selected layout option
* options: list of strings identifying valid layout options
**/

function Layout() {
  this.jitterElem = null;
  this.selected = null;
  this.options = [];
}

/**
* @param [str] options: an array of layout strings; each should
*   be an attribute in data.cells[ithCell].layouts
**/

Layout.prototype.init = function(options) {
  this.options = options;
  this.selected = data.json.initial_layout || Object.keys(options)[0];
  this.elems = {
    input: document.querySelector('#jitter-input'),
    container: document.querySelector('#jitter-container'),
    //icons: document.querySelector('#icons'),
  }
  //this.addEventListeners();
  //this.selectActiveIcon();
  //data.hotspots.showHide();
  //layout.showHideJitter();
}

// ------------------------------------------------------------------------------------------------------------

/**
* Picker: Mouse event handler that uses gpu picking
**/

function Picker() {
  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0x000000);
  this.mouseDown = new THREE.Vector2();
  this.tex = this.getTexture();
}

// get the texture on which off-screen rendering will happen
Picker.prototype.getTexture = function() {
  var canvasSize = getCanvasSize();
  var tex = new THREE.WebGLRenderTarget(canvasSize.w, canvasSize.h);
  tex.texture.minFilter = THREE.LinearFilter;
  return tex;
}

// on canvas mousedown store the coords where user moused down
Picker.prototype.onMouseDown = function(e) {
  var click = this.getClickOffsets(e);
  this.mouseDown.x = click.x;
  this.mouseDown.y = click.y;
}

// get the x, y offsets of a click within the canvas
Picker.prototype.getClickOffsets = function(e) {
  var rect = e.target.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  }
}

// on canvas click, show detailed modal with clicked image
Picker.prototype.onMouseUp = function(e) {
  // if click hit background, close the modal
  console.log('onMouseUp')
}

// get the mesh in which to render picking elements
Picker.prototype.init = function() {
  world.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
  document.body.addEventListener('mouseup', this.onMouseUp.bind(this));
  var group = new THREE.Group();
  for (var i=0; i<world.group.children.length; i++) {
    var mesh = world.group.children[i].clone();
    mesh.material = world.getShaderMaterial({useColor: true});
    group.add(mesh);
  }
  this.scene.add(group);
}

// draw an offscreen world then reset the render target so world can update
Picker.prototype.render = function() {
  world.renderer.setRenderTarget(this.tex);
  world.renderer.render(this.scene, world.camera);
  world.renderer.setRenderTarget(null);
}

Picker.prototype.select = function(obj) {
  if (!world || !obj) return;
  this.render();
  // read the texture color at the current mouse pixel
  var pixelBuffer = new Uint8Array(4),
      x = obj.x * window.devicePixelRatio,
      y = this.tex.height - obj.y * window.devicePixelRatio;
  world.renderer.readRenderTargetPixels(this.tex, x, y, 1, 1, pixelBuffer);
  var id = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2]),
      cellIdx = id-1; // ids use id+1 as the id of null selections is 0
  return cellIdx;
}
// ------------------------------------------------------------------------------------------------------------

/**
* World: Container object for the THREE.js scene that renders all cells
*
* scene: a THREE.Scene() object
* camera: a THREE.PerspectiveCamera() object
* renderer: a THREE.WebGLRenderer() object
* controls: a THREE.TrackballControls() object
* stats: a Stats() object
* color: a THREE.Color() object
* center: a map identifying the midpoint of cells' positions in x,y dims
* group: the group of meshes used to render cells
* state: a map identifying internal state of the world
**/

function World() {
  this.canvas = document.querySelector('#pixplot-canvas');
  this.scene = this.getScene();
  this.camera = this.getCamera();
  this.renderer = this.getRenderer();
  this.controls = this.getControls();
  // this.stats = this.getStats();
  this.color = new THREE.Color();
  this.center = {};
  this.group = {};
  this.state = {
    flying: false,
    transitioning: false,
    displayed: false,
    mode: 'pan', // 'pan' || 'select'
  };
  this.elems = {
    pointSize: document.querySelector('#pointsize-range-input'),
  };
  this.addEventListeners();
  //var gl = this.canvas.getContext('webgl');
  //gl.clearColor(0.75, 0.85, 0.8, 1.0);
  //gl.clear(gl.COLOR_BUFFER_BIT);
}

/**
* Return a scene object with a background color
**/

World.prototype.getScene = function() {
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xFFFFFF);
  return scene;
}
World.prototype.getCamera = function() {
  var canvasSize = getCanvasSize();
  var aspectRatio = canvasSize.w /canvasSize.h;
  return new THREE.PerspectiveCamera(75, aspectRatio, 0.001, 10);
}
/**
* Generate the renderer to be used in the scene
**/

World.prototype.getRenderer = function() {
  return new THREE.WebGLRenderer({
    antialias: true,
    canvas: this.canvas,
  });
}
/**
* Generate the controls to be used in the scene
* @param {obj} camera: the three.js camera for the scene
* @param {obj} renderer: the three.js renderer for the scene
**/

World.prototype.getControls = function() {
  var controls = new THREE.TrackballControls(this.camera, this.canvas);
  controls.zoomSpeed = 0.4;
  controls.panSpeed = 0.4;
  controls.noRotate = true;
  return controls;
}

/**
* Heightmap functions
**/

// load the heightmap
World.prototype.getHeightMap = function(callback) {
  // load an image for setting 3d vertex positions
  var img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = function() {
    var canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    this.heightmap = ctx.getImageData(0,0, img.width, img.height);
    callback();
  }.bind(this);
  img.src = this.heightmap || 'assets/images/heightmap.jpg';
}

// determine the height of the heightmap at coordinates x,y
World.prototype.getHeightAt = function(x, y) {
  var x = (x+1)/2, // rescale x,y axes from -1:1 to 0:1
      y = (y+1)/2,
      row = Math.floor(y * (this.heightmap.height-1)),
      col = Math.floor(x * (this.heightmap.width-1)),
      idx = (row * this.heightmap.width * 4) + (col * 4),
      z = this.heightmap.data[idx] * (this.heightmapScalar/1000 || 0.0);
  console.log(' **heightmapScalar: ', this.heightmapScalar, z)
  return z;
}

/**
* Set the center point of the scene
**/

World.prototype.setCenter = function() {
  this.center = {
    x: (data.boundingBox.x.min + data.boundingBox.x.max) / 2,
    y: (data.boundingBox.y.min + data.boundingBox.y.max) / 2,
  }
}
/**
* Draw each of the vertices
**/

/**
* Find the index of each cell's draw call
**/
World.prototype.getDrawCallToCells = function() {
  var drawCallToCells = {};
  for (var i=0; i<data.cells.length; i++) {
    var cell = data.cells[i],
        drawCall = cell.getIndexOfDrawCall();
    if (!(drawCall in drawCallToCells)) drawCallToCells[drawCall] = [cell]
    else drawCallToCells[drawCall].push(cell);
    // console.log('**line940:', cell) // HUILLCA
  }
  return drawCallToCells;
}

World.prototype.plot = function() {
  // add the cells for each draw call
  var drawCallToCells = this.getDrawCallToCells();
  this.group = new THREE.Group();
  for (var drawCallIdx in drawCallToCells) {
    var meshCells = drawCallToCells[drawCallIdx],
        attrs = this.getGroupAttributes(meshCells),
        geometry = new THREE.BufferGeometry();
    geometry.setAttribute('pos0', attrs.pos0);
    geometry.setAttribute('pos1', attrs.pos1);
    geometry.setAttribute('color', attrs.color);
    geometry.setAttribute('width', attrs.width);
    geometry.setAttribute('height', attrs.height);
    geometry.setAttribute('offset', attrs.offset);
    geometry.setAttribute('opacity', attrs.opacity);
    geometry.setAttribute('selected', attrs.selected);
    geometry.setAttribute('textureIndex', attrs.textureIndex);
    geometry.setAttribute('myborderColor', attrs.clusIdColor); // HUILLCA
    geometry.setDrawRange(0, meshCells.length); // points not rendered unless draw range is specified
    console.log(' **', attrs) // HUILLCA
    var material = this.getShaderMaterial({
      firstTex: attrs.texStartIdx,
      textures: attrs.textures,
      useColor: false,
    }, -1); // HUILLCA PROBLEM
    material.transparent = true;
    var mesh = new THREE.Points(geometry, material);
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }
  this.scene.add(this.group);
}

/**
* Return attribute data for the initial draw call of a mesh
**/

World.prototype.getGroupAttributes = function(cells) {
  var it = this.getCellIterators(cells.length);
  for (var i=0; i<cells.length; i++) {
    var cell = cells[i];
    var rgb = this.color.setHex(cells[i].idx + 1); // use 1-based ids for colors
    it.texIndex[it.texIndexIterator++] = cell.texIdx; // index of texture among all textures -1 means LOD texture
    it.pos0[it.pos0Iterator++] = cell.x; // current position.x
    it.pos0[it.pos0Iterator++] = cell.y; // current position.y
    it.pos0[it.pos0Iterator++] = cell.z; // current position.z
    it.pos1[it.pos1Iterator++] = cell.tx; // target position.x
    it.pos1[it.pos1Iterator++] = cell.ty; // target position.y
    it.pos1[it.pos1Iterator++] = cell.tz; // target position.z
    it.color[it.colorIterator++] = rgb.r; // could be single float
    it.color[it.colorIterator++] = rgb.g; // unique color for GPU picking
    it.color[it.colorIterator++] = rgb.b; // unique color for GPU picking
    it.opacity[it.opacityIterator++] = 1.0; // cell opacity value
    it.selected[it.selectedIterator++] = 0.0; // 1.0 if cell is selected, else 0.0
    it.width[it.widthIterator++] = cell.w; // px width of cell in lod atlas
    it.height[it.heightIterator++] = cell.h; // px height of cell in lod atlas
    it.offset[it.offsetIterator++] = cell.dx; // px offset of cell from left of tex
    it.offset[it.offsetIterator++] = cell.dy; // px offset of cell from top of tex

    it.clusIdColor[it.clusIdColorIterator++] = colors_cluster[cell.clusId][0]; // HUILLCA cluster-id para pintar el borde de la imagen/cell
    it.clusIdColor[it.clusIdColorIterator++] = colors_cluster[cell.clusId][1];
    it.clusIdColor[it.clusIdColorIterator++] = colors_cluster[cell.clusId][2];
  }
  // format the arrays into THREE attributes
  var pos0 = new THREE.BufferAttribute(it.pos0, 3, true, 1),
      pos1 = new THREE.BufferAttribute(it.pos1, 3, true, 1),
      color = new THREE.BufferAttribute(it.color, 3, true, 1),
      opacity = new THREE.BufferAttribute(it.opacity, 1, true, 1),
      selected = new THREE.Uint8BufferAttribute(it.selected, 1, false, 1),
      texIndex = new THREE.Int8BufferAttribute(it.texIndex, 1, false, 1),
      width = new THREE.Uint8BufferAttribute(it.width, 1, false, 1),
      height = new THREE.Uint8BufferAttribute(it.height, 1, false, 1),
      offset = new THREE.Uint16BufferAttribute(it.offset, 2, false, 1),
      clusIdColor = new THREE.BufferAttribute(it.clusIdColor, 3, true, 1); // HUILLCA
  texIndex.usage = THREE.DynamicDrawUsage;
  pos0.usage = THREE.DynamicDrawUsage;
  pos1.usage = THREE.DynamicDrawUsage;
  opacity.usage = THREE.DynamicDrawUsage;
  selected.usage = THREE.DynamicDrawUsage;
  offset.usage = THREE.DynamicDrawUsage;
  clusIdColor.usage = THREE.DynamicDrawUsage; // HUILLCA
  var texIndices = this.getTexIndices(cells);
  return {
    pos0: pos0,
    pos1: pos1,
    color: color,
    width: width,
    height: height,
    offset: offset,
    opacity: opacity,
    selected: selected,
    textureIndex: texIndex,
    textures: this.getTextures({
      startIdx: texIndices.first,
      endIdx: texIndices.last,
    }),
    texStartIdx: texIndices.first,
    texEndIdx: texIndices.last,
    clusIdColor: clusIdColor // HUILLCA
  }
}

/**
* Get the iterators required to store attribute data for `n` cells
**/

World.prototype.getCellIterators = function(n) {
  return {
    pos0: new Float32Array(n * 3),
    pos1: new Float32Array(n * 3),
    color: new Float32Array(n * 3),
    width: new Uint8Array(n),
    height: new Uint8Array(n),
    offset: new Uint16Array(n * 2),
    opacity: new Float32Array(n),
    selected: new Uint8Array(n),
    texIndex: new Int8Array(n),
    clusIdColor: new Float32Array(n * 3),
    pos0Iterator: 0,
    pos1Iterator: 0,
    colorIterator: 0,
    widthIterator: 0,
    heightIterator: 0,
    offsetIterator: 0,
    opacityIterator: 0,
    selectedIterator: 0,
    texIndexIterator: 0,
    clusIdColorIterator: 0,
  }
}

/**
* Find the first and last non -1 tex indices from a list of cells
**/

World.prototype.getTexIndices = function(cells) {
  // find the first non -1 tex index
  var f=0; while (cells[f].texIdx == -1) f++;
  // find the last non -1 tex index
  var l=cells.length-1; while (cells[l].texIdx == -1) l--;
  // return the first and last non -1 tex indices
  return {
    first: cells[f].texIdx,
    last: cells[l].texIdx,
  };
}

/**
* Return textures from `obj.startIdx` to `obj.endIdx` indices
**/

World.prototype.getTextures = function(obj) {
  var textures = [];
  for (var i=obj.startIdx; i<=obj.endIdx; i++) {
    var tex = this.getTexture(data.textures[i].canvas);
    textures.push(tex);
  }
  return textures;
}

/**
* Transform a canvas object into a THREE texture
**/

World.prototype.getTexture = function(canvas) {
  var tex = new THREE.Texture(canvas);
  tex.needsUpdate = true;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/**
* Return an int specifying the scalar uniform for points
**/

World.prototype.getPointScale = function() {
  var scalar = parseFloat(this.elems.pointSize.value),
      canvasSize = getCanvasSize();
  return scalar * window.devicePixelRatio * canvasSize.h;
}

/**
* Build a RawShaderMaterial. For a list of all types, see:
*   https://github.com/mrdoob/three.js/wiki/Uniforms-types
*
* @params:
*   {obj}
*     textures {arr}: array of textures to use in fragment shader
*     useColor {bool}: determines whether to use color in frag shader
*     firstTex {int}: the index position of the first texture in `textures`
*       within data.textures
**/

World.prototype.getShaderMaterial = function(obj, clus_id) {
  var vertex = document.querySelector('#vertex-shader').textContent;
  //console.log('VERTEXSAHDER: ', vertex);
  var fragment = this.getFragmentShader(obj);
  // set the uniforms and the shaders to use
  return new THREE.RawShaderMaterial({
    uniforms: {
      textures: {
        type: 'tv',
        value: obj.textures,
      },
      lodTexture: {
        type: 't',
        value: null, //lod.tex.texture,
      },
      transitionPercent: {
        type: 'f',
        value: 0,
      },
      scale: {
        type: 'f',
        value: this.getPointScale(),
      },
      scaleTarget: {
        type: 'f',
        value: this.getPointScale(),
      },
      useColor: {
        type: 'f',
        value: obj.useColor ? 1.0 : 0.0,
      },
      cellAtlasPxPerSide: {
        type: 'f',
        value: config.size.texture,
      },
      lodAtlasPxPerSide: {
        type: 'f',
        value: config.size.lodTexture,
      },
      cellPxHeight: {
        type: 'f',
        value: config.size.cell,
      },
      lodPxHeight: {
        type: 'f',
        value: config.size.lodCell,
      },
      borderWidth: {
        type: 'f',
        value: 0.15,
      },
      borderColor: {
        type: 'vec3',
        value: new Float32Array([234/255, 183/255, 85/255]),
      },
      delay: {
        type: 'f',
        value: config.transitions.delay,
      }
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}


/**
* Return the color fragment shader or prepare and return
* the texture fragment shader.
*
* @params:
*   {obj}
*     textures {arr}: array of textures to use in fragment shader
*     useColor {float}: 0/1 determines whether to use color in frag shader
*     firstTex {int}: the index position of the first texture in `textures`
*       within data.textures
**/

World.prototype.getFragmentShader = function(obj) {
  var useColor = obj.useColor,
      firstTex = obj.firstTex,
      textures = obj.textures,
      fragShader = document.querySelector('#fragment-shader').textContent;
  // the calling agent requested the color shader, used for selecting
  if (useColor) {
    fragShader = fragShader.replace('uniform sampler2D textures[N_TEXTURES];', '');
    fragShader = fragShader.replace('TEXTURE_LOOKUP_TREE', '');
    return fragShader;
  // the calling agent requested the textured shader
  } else {
    // get the texture lookup tree
    var tree = this.getFragLeaf(-1, 'lodTexture');
    for (var i=firstTex; i<firstTex + textures.length; i++) {
      tree += ' else ' + this.getFragLeaf(i, 'textures[' + i + ']');
    }
    // replace the text in the fragment shader
    fragShader = fragShader.replace('#define SELECTING\n', '');
    fragShader = fragShader.replace('N_TEXTURES', textures.length);
    fragShader = fragShader.replace('TEXTURE_LOOKUP_TREE', tree);
    return fragShader;
  }
}

/**
* Get the leaf component of a texture lookup tree (whitespace is aesthetic)
**/

World.prototype.getFragLeaf = function(texIdx, tex) {
  return 'if (textureIndex == ' + texIdx + ') {\n          ' +
    'gl_FragColor = texture2D(' + tex + ', scaledUv);\n        }';
}

/**
* Get the initial camera location
**/

World.prototype.getInitialLocation = function() {
  return {
    x: 0, //this.center.x,
    y: 0, //this.center.y,
    z: 2.0,
  }
}

// helper function to set uniforms on all meshes
World.prototype.setUniform = function(key, val) {
  var meshes = this.group.children.concat(picker.scene.children[0].children);
  for (var i=0; i<meshes.length; i++) {
    meshes[i].material.uniforms[key].value = val;
  }
}
/**
* Add event listeners, e.g. to resize canvas on window resize
**/

World.prototype.addEventListeners = function() {
  this.addResizeListener();
  this.addLostContextListener();
  this.addScalarChangeListener();
  this.addTabChangeListeners();
  this.addModeChangeListeners();
}

/**
* Resize event listeners
**/

World.prototype.addResizeListener = function() {
  window.addEventListener('resize', this.handleResize.bind(this), false);
}

World.prototype.handleResize = function() {
  var canvasSize = getCanvasSize(),
      w = canvasSize.w * window.devicePixelRatio,
      h = canvasSize.h * window.devicePixelRatio;
  this.camera.aspect = w / h;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize(w, h, false);
  this.controls.handleResize();
  picker.tex.setSize(w, h);
  this.setPointScalar();
}

/**
* Initialize the render loop
**/

World.prototype.render = function() {
  requestAnimationFrame(this.render.bind(this));
  if (!this.state.displayed) return;
  this.renderer.render(this.scene, this.camera);
  // update the controls
  this.controls.update();
  // update the stats
  if (this.stats) this.stats.update();
  // update the level of detail mechanism
  //lod.update();
  // update the dragged selection
  //selection.update();
}

/**
* Initialize the plotting
**/

World.prototype.init = function() {
  this.setCenter();
  // center the camera and position the controls
  var loc = this.getInitialLocation();
  this.camera.position.set(loc.x, loc.y, loc.z);
  this.camera.lookAt(loc.x, loc.y, loc.z);
  // render the selection
  //selection.init();
  // draw the points and start the render loop
  this.plot();
  //resize the canvas and scale rendered assets
  this.handleResize();
  // initialize the first frame
  this.render();
  // set the mode
  this.setMode('pan');
  // set the display boolean
  world.state.displayed = true;
}

/**
* Handle clicks that request a new mode
**/

World.prototype.handleModeIconClick = function(e) {
  this.setMode(e.target.id);
}

/**
* Toggle the current world 'mode':
*   'pan' means we're panning through x, y coords
*   'select' means we're selecting cells to analyze
**/

World.prototype.setMode = function(mode) {
  this.mode = mode;
  // update the ui buttons to match the selected mode
  var elems = document.querySelectorAll('#selection-icons img');
  for (var i=0; i<elems.length; i++) {
    elems[i].className = elems[i].id == mode ? 'active' : '';
  }
  // update internal state to reflect selected mode
  if (this.mode == 'pan') {
    this.controls.noPan = false;
    this.canvas.classList.remove('select');
    this.canvas.classList.add('pan');
  } else if (this.mode == 'select') {
    this.controls.noPan = true;
    this.canvas.classList.remove('pan');
    this.canvas.classList.add('select');
    selection.start();
  }
}

  /**
* Set the point size scalar as a uniform on all meshes
**/

World.prototype.setPointScalar = function() {
  // handle case of drag before scene renders
  if (!this.state.displayed) return;
  // update the displayed and selector meshes
  this.setUniform('scale', this.getPointScale())
}

/**
* Update the point size when the user changes the input slider
**/

World.prototype.addScalarChangeListener = function() {
  this.elems.pointSize.addEventListener('change', this.setPointScalar.bind(this));
  this.elems.pointSize.addEventListener('input', this.setPointScalar.bind(this));
}

/**
* Refrain from drawing scene when user isn't looking at page
**/

World.prototype.addTabChangeListeners = function() {
  // change the canvas size to handle Chromium bug 1034019
  window.addEventListener('visibilitychange', function() {
    this.canvas.width = this.canvas.width + 1;
    setTimeout(function() {
      this.canvas.width = this.canvas.width - 1;
    }.bind(this), 50);
  }.bind(this))
}

/**
* listen for loss of webgl context; to manually lose context:
* world.renderer.context.getExtension('WEBGL_lose_context').loseContext();
**/

World.prototype.addLostContextListener = function() {
  this.canvas.addEventListener('webglcontextlost', function(e) {
    e.preventDefault();
    window.location.reload();
  });
}

/**
* Listen for changes in world.mode
**/

World.prototype.addModeChangeListeners = function() {
  document.querySelector('#pan').addEventListener('click', this.handleModeIconClick.bind(this));
  document.querySelector('#select').addEventListener('click', this.handleModeIconClick.bind(this));
}

// ------------------------------------------------------------------------------------------------------------

/**
* Handle load progress and welcome scene events
**/

function Welcome() {
    this.progressElem = document.querySelector('#progress');
    this.loaderTextElem = document.querySelector('#loader-text');
    this.loaderSceneElem = document.querySelector('#loader-scene');
    this.buttonElem = document.querySelector('#enter-button');
    this.buttonElem.addEventListener('click', this.onButtonClick.bind(this));
}

Welcome.prototype.onButtonClick = function(e) {
    if (e.target.className.indexOf('active') > -1) {
      requestAnimationFrame(function() {
        this.removeLoader(function() {
          this.startWorld();
        }.bind(this));
      }.bind(this));
    }
  }
  
  Welcome.prototype.removeLoader = function(onSuccess) {
    var blocks = document.querySelectorAll('.block');
    for (var i=0; i<blocks.length; i++) {
      setTimeout(function(i) {
        blocks[i].style.animation = 'exit 300s';
        setTimeout(function(i) {
          blocks[i].parentNode.removeChild(blocks[i]);
          if (i == blocks.length-1) onSuccess();
        }.bind(this, i), 1000)
      }.bind(this, i), i*100)
    }
    document.querySelector('#progress').style.opacity = 0;
  }

  Welcome.prototype.updateProgress = function() {
    var progress = valueSum(data.textureProgress) / data.textureCount;
    // remove the decimal value from the load progress
    // progress = 100 // HUILLCA: test
    progress = progress.toString();
    var index = progress.indexOf('.');
    if (index > -1) progress = progress.substring(0, index);
    // display the load progress
    this.progressElem.textContent = progress + '%';
    if (progress == 100 &&
      data.loadedTextures == data.textureCount) { // HUILLCA: verify data
      this.buttonElem.className += ' active';
    }
  }

  Welcome.prototype.startWorld = function() {
    requestAnimationFrame(function() {
      world.init();
      picker.init();
      //text.init();
      //dates.init();
      setTimeout(function() {
        requestAnimationFrame(function() {
          document.querySelector('#loader-scene').classList += 'hidden';
        })
      }, 1500) // HUILLCA: Tiempo de animacion de carga
    }.bind(this))
  }



  
// ------------------------------------------------------------------------------------------------------------
/**
* Get the H,W of the canvas to use for rendering
**/

function getCanvasSize() {
  var elem = document.querySelector('#pixplot-canvas');
  return {
    w: elem.clientWidth,
    h: elem.clientHeight,
  }
}

/**
* Create an element
*
* @param {obj} obj
*   tag: specifies the tag to use for the element
*   obj: a set of k/v attributes to be applied to the element
**/

function getElem(tag, obj) {
  var obj = obj || {};
  var elem = document.createElement(tag);
  Object.keys(obj).forEach(function(attr) {
    elem[attr] = obj[attr];
  })
  return elem;
}

/**
* Make an XHR get request for data
*
* @param {str} url: the url of the data to fetch
* @param {func} onSuccess: onSuccess callback function
* @param {func} onErr: onError callback function
**/

function get(url, onSuccess, onErr) {
  onSuccess = onSuccess || function() {};
  onErr = onErr || function() {};
  var xhr = new XMLHttpRequest();
  xhr.overrideMimeType('text\/plain; charset=x-user-defined');
  xhr.onreadystatechange = function() {
    if (xhr.readyState == XMLHttpRequest.DONE) {
      if (xhr.status === 200) {
        var data = xhr.responseText;
        // unzip the data if necessary
        if (url.substring(url.length-3) == '.gz') {
          data = gunzip(data);
          url = url.substring(0, url.length-3);
        }
        // determine if data can be JSON parsed
        url.substring(url.length-5) == '.json'
          ? onSuccess(JSON.parse(data))
          : onSuccess(data);
      } else {
        onErr(xhr)
      }
    };
  };
  xhr.open('GET', url, true);
  xhr.send();
};

/**
* Find the sum of values in an object
**/

function valueSum(obj) {
  return Object.keys(obj).reduce(function(a, b) {
    a += obj[b]; return a;
  }, 0)
}

/**
* Get the user's current url route
**/

function getPath(path) {
  var base = window.location.origin;
  base += window.location.pathname.replace('index.html', '');
  base += path.replace('pixplot_output/', '');
  // console.log(base)
  return base;
}

// ------------------------------------------------------------------------------------------------------------
/**
* Main
**/
console.log('hi..1')
window.devicePixelRatio = Math.min(window.devicePixelRatio, 2);
var welcome = new Welcome();
var webgl = new Webgl();
var config = new Config();
var picker = new Picker();
var layout = new Layout();
var world = new World();
var data = new Data();
//data.load()