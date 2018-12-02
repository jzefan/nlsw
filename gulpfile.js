var gulp = require('gulp');
var nodemon = require('gulp-nodemon');
var gutil = require('gulp-util')
var uglify = require('gulp-uglify');
var watchPath = require('gulp-watch-path')
var combiner = require('stream-combiner2')
var sourcemaps = require('gulp-sourcemaps')
var minifycss = require('gulp-clean-css')
//var autoprefixer = require('gulp-autoprefixer')

gulp.task('run', function(){
  nodemon({
    script: 'app',
    ext: 'js',
    env: {'NODE_ENV': 'development'}
  });
});

var handleError = function (err) {
    var colors = gutil.colors;
    console.log('\n')
    gutil.log(colors.red('Error!'))
    gutil.log('fileName: ' + colors.red(err.fileName))
    gutil.log('lineNumber: ' + colors.red(err.lineNumber))
    gutil.log('message: ' + err.message)
    gutil.log('plugin: ' + colors.yellow(err.plugin))
}

gulp.task('watchjs', function () {
    gulp.watch('client/js/**/*.js', function (event) {
        var paths = watchPath(event, 'client/', 'public/')
        gutil.log(gutil.colors.green(event.type) + ' ' + paths.srcPath)
        gutil.log('Dist ' + paths.distPath)

        var combined = combiner.obj([
            gulp.src(paths.srcPath),
            sourcemaps.init(),
            uglify(),
            sourcemaps.write('./'),
            gulp.dest(paths.distDir)
        ])

        combined.on('error', handleError)
    })
})

gulp.task('uglifyjs', function () {
    var combined = combiner.obj([
        gulp.src('client/js/**/*.js'),
        sourcemaps.init(),
        uglify(),
        sourcemaps.write('./'),
        gulp.dest('public/js/')
    ])
    combined.on('error', handleError)
})


gulp.task('watchcss', function () {
    gulp.watch('client/css/**/*.css', function (event) {
        var paths = watchPath(event, 'client/', 'public/')

        gutil.log(gutil.colors.green(event.type) + ' ' + paths.srcPath)
        gutil.log('Dist ' + paths.distPath)

        gulp.src(paths.srcPath)
            .pipe(sourcemaps.init())
            .pipe(minifycss())
            .pipe(sourcemaps.write('./'))
            .pipe(gulp.dest(paths.distDir))
    })
})

gulp.task('minifycss', function () {
    gulp.src('client/css/**/*.css')
        .pipe(sourcemaps.init())
        //.pipe(autoprefixer({ browsers: 'last 2 versions' }))
        .pipe(minifycss())
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('public/css/'))
})

gulp.task('default', ['uglifyjs', 'minifycss', 'run', 'watchjs', 'watchcss']);
