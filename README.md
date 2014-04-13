# Demo bookstore application in Famo.Us

This project is a kind of my attempt to write simple typical mobile application in javascript using new Famo.Us framework. Feel you free to use it as a demo application while learing/investigating famo.us.

Will be very appreciated to get feedback, bug reports or suggestions how to improve the code.

Here is a my blog where I plan to describe development process: [http://logicify.com/blog/famous-first-look/](http://logicify.com/blog/famous-first-look/)

# Demo

Checkout online demo here: http://logicify.github.io/famous-demo-bookstore/

##Dependencies

First make sure you have node.js, grunt-cli, and bower installed.

```
brew install node
npm install -g grunt-cli bower
```

If you are installing node for the fist time you will most likely need to add npm to your path

```
$ export PATH="/usr/local/share/npm/bin:$PATH"
```

You will probably want to add that to you .bash_profile.  I'll assume if you are using any other shell that you know what you are doing already :P

##Getting Started

```
npm install && bower install
```

That's it!!!

##Running the Development Server

Simply run ```grunt serve``` and you will start a local development server and open Chrome.  Watch tasks will be running, and your browser will be automatically refreshed whenever a file in the repo changes.

You can run serve with ```--port=9001``` to manually pick the port that the server will run on

##Production

If you would like to compile your project for distribution simply run the command ```grunt``` to build ```dist/``` which will be a deployment ready version of your app.  Preprocessing will be applied to html, all js will be concatenated and minified.  All js / css assets will also have their name prepended with a hash for cache busting.

Credits
-------
Dmitry Berezovsky, Logicify (<http://logicify.com/>)