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
    //ease: Power3.easeOut,
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
  // world.getHeightMap(this.load.bind(this)); // HUILLCA --
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
  // world.elems.pointSize.min = 0;
  // world.elems.pointSize.max = config.size.points.max;
  // world.elems.pointSize.value = config.size.points.initial;
  // set number of atlases and textures
  this.atlasCount = json.atlas.count;
  this.textureCount = Math.ceil(json.atlas.count / config.atlasesPerTex);
  this.layouts = json.layouts;
  // this.hotspots = new Hotspots();
  // layout.init(Object.keys(this.layouts));
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
  // get(getPath(this.layouts[layout.selected].layout), this.addCells.bind(this))
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
  //this.canvas = getElem('canvas', {
  //  width: config.size.texture,
  //  height: config.size.texture,
  //  id: 'texture-' + this.idx,
  //})
  //this.ctx = this.canvas.getContext('2d');
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
  // this.ctx.drawImage(atlas.image, d.x, d.y, w, h);  HUILLCA **
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

  var gl = this.canvas.getContext('webgl');
  gl.clearColor(0.75, 0.85, 0.8, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/**
* Return a scene object with a background color
**/

World.prototype.getScene = function() {
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xFFFFFF);
  return scene;
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
      //world.init();
      //picker.init();
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
var world = new World();
var data = new Data();
data.load()