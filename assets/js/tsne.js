

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
    //var progress = valueSum(data.textureProgress) / data.textureCount;
    // remove the decimal value from the load progress
    progress = 100 // HUILLCA: test
    progress = progress.toString();
    var index = progress.indexOf('.');
    if (index > -1) progress = progress.substring(0, index);
    // display the load progress
    this.progressElem.textContent = progress + '%';
    if (progress == 100) { // HUILLCA: verify data
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
  
/**
* Main
**/
window.devicePixelRatio = Math.min(window.devicePixelRatio, 2);
var welcome = new Welcome();
welcome.updateProgress()