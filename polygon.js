
if (typeof require !== 'undefined') {
  var Vec2 = require('vec2');
  var segseg = require('segseg');
  var Line2 = require('line2');
}

var PI = Math.PI;
var TAU = PI*2;
var toTAU = function(rads) {
  if (rads<0) {
    rads += TAU;
  }

  return rads;
};

var isArray = function (a) {
  return Object.prototype.toString.call(a) === "[object Array]";
}

var isFunction = function(a) {
  return typeof a === 'function';
}

var defined = function(a) {
  return typeof a !== 'undefined';
}


function Polygon(points) {
  if (points instanceof Polygon) {
    return points;
  }

  if (!(this instanceof Polygon)) {
    return new Polygon(points);
  }

  if (!Array.isArray(points)) {
    points = (points) ? [points] : [];
  }

  this.points = points.map(function(point) {
    if (Array.isArray(point)) {
      return Vec2.fromArray(point);
    } else if (!(point instanceof Vec2)) {
      if (typeof point.x !== 'undefined' &&
          typeof point.y !== 'undefined')
      {
        return Vec2(point.x, point.y);
      }
    } else {
      return point;
    }
  });
}

Polygon.prototype = {
  each : function(fn) {
    for (var i = 0; i<this.points.length; i++) {
      if (fn.call(this, this.point(i-1), this.point(i), this.point(i+1), i) === false) {
        break;
      }
    }
    return this;
  },

  point : function(idx) {
    var el = idx%(this.points.length);
    if (el<0) {
      el = this.points.length + el;
    }

    return this.points[el];
  },

  dedupe : function(returnNew) {
    var seen = {};
    // TODO: make this a tree
    var points = this.points.filter(function(a) {
      var key = a.x + ':' + a.y;
      if (!seen[key]) {
        seen[key] = true;
        return true;
      }
    });

    if (returnNew) {
      return new Polygon(points);
    } else {
      this.points = points;
      return this;
    }
  },

  remove : function(vec) {
    this.points = this.points.filter(function(point) {
      return point!==vec;
    });
    return this;
  },

  // Remove identical points occurring one after the other
  clean : function(returnNew) {
    var last = this.point(-1);

    var points = this.points.filter(function(a) {
      var ret = false;
      if (!last.equal(a)) {
        ret = true;
      }

      last = a;
      return ret;
    });

    if (returnNew) {
      return new Polygon(points);
    } else {
      this.points = points
      return this;
    }
  },

  simplify : function() {
    var clean = function(v) {
      return Math.round(v * 10000)/10000;
    }

    var collinear = function(a, b, c) {
      var r = a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y);
      return clean(r) === 0;
    };

    this.points = this.points.filter(Boolean);

    var newPoly = [];
    for (var i = 0; i<this.points.length; i++) {
      var p = this.point(i-1);
      var n = this.point(i+1);
      var c = this.point(i);

      var angle = c.subtract(p, true).angleTo(c.subtract(n, true));

      if (!collinear(p, c, n) && clean(angle)) {
        newPoly.push(c);
      }
    }

    this.points = newPoly;
    return this;
  },

  winding : function() {
    return this.area() > 0;
  },

  rewind : function(cw) {
    cw = !!cw;
    var winding = this.winding();
    if (winding !== cw) {
      this.points.reverse();
    }
    return this;
  },

  area : function() {
    var area = 0;
    var first = this.point(0);

    this.each(function(prev, current, next, idx) {
      if (idx<2) { return; }

      var edge1 = first.subtract(current, true);
      var edge2 = first.subtract(prev, true);
      area += ((edge1.x * edge2.y) - (edge1.y * edge2.x));
    });

    return area/2;
  },

  closestPointTo : function(vec) {
    var points = [],
        l = this.points.length,
        dist = Infinity,
        found = null,
        foundIndex = 0,
        foundOnPoint = false,
        i;

    for (i=0; i<l; i++) {

      var a = this.point(i-1);
      var b = this.point(i);
      var ab = b.subtract(a, true);
      var veca = vec.subtract(a, true);
      var vecadot = veca.dot(ab);
      var abdot = ab.dot(ab);

      var t = Math.min(Math.max(vecadot/abdot, 0), 1);

      var point = ab.multiply(t).add(a);
      var length = vec.subtract(point, true).lengthSquared();

      if (length < dist) {
        found = point;
        foundIndex = i;
        foundOnPoint = t===0 || t===1;
        dist = length;
      }
    }

    found.prev = this.point(foundIndex-1);
    found.next = this.point(foundIndex+1);

    if (foundOnPoint) {
      found.current = this.point(foundIndex);
    }

    return found;
  },

  center : function() {
    // TODO: the center of a polygon is not the center of it's aabb.
    var aabb = this.aabb();
    return Vec2(aabb.x + aabb.w/2, aabb.y + aabb.h/2);
  },

  scale : function(amount, origin, returnTrue) {
    var obj = this;
    if (returnTrue) {
      obj = this.clone();
    }

    if (!origin) {
      origin = obj.center();
    }

    obj.each(function(p, c) {
      c.multiply(amount);
    });

    var originDiff = origin.multiply(amount, true).subtract(origin);

    obj.each(function(p, c) {
      c.subtract(originDiff);
    });

    return obj;
  },

  containsPoint : function(point) {
    var c = false;

    this.each(function(prev, current, next) {
      ((prev.y <= point.y && point.y < current.y) || (current.y <= point.y && point.y < prev.y))
        && (point.x < (current.x - prev.x) * (point.y - prev.y) / (current.y - prev.y) + prev.x)
        && (c = !c);
    });

    return c;
  },

  containsPolygon : function(subject) {
    if (isArray(subject)) {
      subject = new Polygon(subject);
    }

    for (var i=0; i<subject.points.length; i++) {
      if (!this.containsPoint(subject.points[i])) {
        return false;
      }
    }

    for (var i=0; i<this.points.length; i++) {
      var outer = this.line(i);
      for (var j=0; j<subject.points.length; j++) {
        var inner = subject.line(j);

        var isect = segseg(outer[0], outer[1], inner[0], inner[1]);
        if (isect && isect !== true) {
          return false;
        }
      }
    }

    return true;
  },


  aabb : function() {
    if (this.points.length<2) {
      return { x: 0, y : 0, w: 0, h: 0};
    }

    var xmin, xmax, ymax, ymin, point1 = this.point(1);

    xmax = xmin = point1.x;
    ymax = ymin = point1.y;

    this.each(function(p, c) {
      if (c.x > xmax) {
        xmax = c.x;
      }

      if (c.x < xmin) {
        xmin = c.x;
      }

      if (c.y > ymax) {
        ymax = c.y;
      }

      if (c.y < ymin) {
        ymin = c.y;
      }
    });

    return {
      x : xmin,
      y : ymin,
      w : xmax - xmin,
      h : ymax - ymin
    };
  },

  offset : function(delta, prune) {

    var res = [];
    this.rewind(false).simplify().each(function(p, c, n, i) {
      var e1 = c.subtract(p, true).normalize();
      var e2 = c.subtract(n, true).normalize();

      var r = delta / Math.sin(Math.acos(e1.dot(e2))/2);
      var d = e1.add(e2, true).normalize().multiply(r, true);

      var angle = toTAU(e1.angleTo(e2));
      var o = e1.perpDot(e2) < 0 ? c.add(d, true) : c.subtract(d, true);

      if (angle > TAU * .75 || angle < TAU * .25) {

        o.computeSegments = angle;
        c.color = "white"
        c.radius = 3;
      }

      o.point = c;
      res.push(o);
    });


    var parline = function(a, b) {
      var normal = a.subtract(b, true);

      var angle = Vec2(1, 0).angleTo(normal);
      var bisector = Vec2(delta, 0).rotate(angle + Math.PI/2);

      bisector.add(b);

      var cperp = bisector.add(normal, true);

      var l = new Line2(bisector.x, bisector.y, cperp.x, cperp.y);
      var n = a.add(normal, true);
      var l2 = new Line2(a.x, a.y, n.x, n.y);
      return l;
    }

    var offsetPolygon = Polygon(res);
    var ret = [];


    offsetPolygon.each(function(p, c, n, i) {

      var isect = segseg(c, c.point, n, n.point);
      if (isect) {

        var pp = offsetPolygon.point(i-2);
        var nn = offsetPolygon.point(i+2);

        var ppline = parline(pp.point, p.point);
        var pline = parline(p.point, c.point);
        var nline = parline(c.point, n.point);
        var nnline = parline(n.point, nn.point);

        // ret.push(ppline.intersect(nline));
        // ret.push(pline.intersect(nline));
        // ret.push(ppline.intersect(pline));
        // ret.push(nline.intersect(nnline));

        var computed = pline.intersect(nnline);
        computed.color = "yellow";
        computed.point = c.point;

        ret.push(computed);

      } else {
        ret.push(c);
      }
    });

    return ret.length ? Polygon(ret) : offsetPolygon;
  },

  line : function(idx) {
    return [this.point(idx), this.point(idx+1)];
  },

  lines : function(fn) {
    var idx = 0;
    this.each(function(p, start, end) {
      fn(start, end, idx++);
    });

    return this;
  },

  selfIntersections : function() {
    var ret = [];
    var poly = this;
    var l = this.points.length+1;
    // TODO: use a faster algorithm. Bentley–Ottmann is a good first choice
    for (var i = 0; i<l; i++) {
      var s = this.point(i-1);
      var e = this.point(i);

      for (var i2 = i+2; i2<=l+1; i2++) {
        var s2 = this.point(i2-1);
        var e2 = this.point(i2);
        var isect = segseg(s, e, s2, e2);

        // self-intersection
        if (isect && isect !== true) {
          var vec = Vec2.fromArray(isect);
          // TODO: wow, this is inneficient but is crucial for creating the
          //       tree later on.
          vec.s = i + (s.subtract(vec, true).length() / s.subtract(e, true).length())
          vec.b = i2 + (s2.subtract(vec, true).length() / s2.subtract(e2, true).length())
          vec.si = i;
          vec.bi = i2;

          vec.color = "red";
          vec.radius = 5;
          ret.push(vec);
        }
      }
    }
    var poly = Polygon(ret).clean();
    console.log(poly);
    return poly;
  },

  pruneSelfIntersections : function() {
    var selfIntersections = this.selfIntersections();
console.log('self isects', selfIntersections.points.length, selfIntersections.dedupe().toString())
    var belongTo = function(s1, b1, s2, b2) {
      return s1 > s2 && b1 < b2
    }

    var contain = function(s1, b1, s2, b2) {
      return s1 < s2 && b1 > b2;
    }

    var interfere = function(s1, b1, s2, b2) {
      return (s1 < s2 && s2 < b1 && b2 > b1) || (s2 < b1 && b1 < b2 && s1 < s2);
    }

    // TODO: create tree based on relationship operations
    // TODO: ensure the root node is valid
    var root = this.point(0).clone();
    root.s = 0;
    root.si = 0;
    root.bi = (this.points.length-1); + 0.99;
    root.b = root.bi + 0.99;
    root.children = [];
    root.depth = 0;

    var last = root;

    selfIntersections.points.sort(function(a, b) {
      return a.s < b.s ? -1 : 1;
    });

    var compare = function(a, b) {
      if (belongTo(a.s, a.b, b.s, b.b)) {
        return 'belongs';
      } else if (contain(a.s, a.b, b.s, b.b)) {
        return 'contains';
      } else if (interfere(a.s, a.b, b.s, b.b)) {
        return 'interferes'
      } else {
        return null;
      }
    }

    var node_reparent = function(node, parent) {
      if (node.parent) {
        node.parent.children = node.parent.children.filter(function(n) {
          return n !== node;
        });
      }

      var oldParent = node.parent || null;
      node.parent = parent;
      node.depth = typeof parent.depth !== 'undefined' ? parent.depth + 1 : 0;
      parent.children.push(node);
      return oldParent;
    };


    selfIntersections.points.forEach(function(c) {
      c.children = [];

      var rb = belongTo(last.s, last.b, c.s, c.b);
      var rc = contain(last.s, last.b, c.s, c.b);
      var ri = interfere(last.s, last.b, c.s, c.b);
      console.log(
        'belongTo:', rb,
        'contain:', rc,
        'interfere:', ri
      );
      if (rc) {
        node_reparent(c, last);
        last = c;
      } else if (rb) {
        // honestly, this should never happen since the array
        // is sorted prior to coming here.
        var parent = node_reparent(last, c);
        node_reparent(c, parent);

      } else if (ri) {
        var parent = last.parent;
        while (parent) {
          var result = compare(parent, c)
          if (!result) {
            parent = parent.parent;
          } else {
            switch (result) {
              case 'belongs':
                console.error('unhandled belongs situation');
              break;

              case 'contains':
                console.error('unhandled contains situation');
              break;

              case 'interferes':
                console.error('interferes');
              break;
            }
            break;
          }
          // console.warn('RESULT', );


          // if (contain(parent.s, parent.b, c.s, c.p)) {
          //   c.depth = parent.depth + 1;
          //   parent.children.push(c);
          //   c.parent = parent;
          //   console.log('landed')
          //   break;
          // }
          // parent = parent.parent;
        }
        console.log('parented', !!c.parent)

        // c.depth = last.parent.depth + 1;
        // last.parent.children = last.parent.children.filter(function(a) {
        //   return a !== last;
        // });

        // c.children.push(last);
        // last.parent.children.push(c);
        // last.parent = c;
      } else {
        // node_reparent(c, last);
        // console.error('unhandled!')
        // last = c;
      }

    });

    console.log('TREE');
console.log(root);
    var ret = []
    var that = this;
    var recurse = function(node) {
      var odd = !!(node.depth % 2);

      console.log(node.depth, odd)
      console.log(new Array(node.depth*4).map(String).join(' '), node.toString())
      if (!odd) {
        var poly = [];

        poly.push(node);

        var collectTo = (node.children.length) ? node.children[0].si : node.bi;

        for (var i=node.si; i<=collectTo; i++) {
          poly.push(that.point(i));
        }
      }

      node.children.forEach(function(child, i) {
        if (!odd) {
          // collect the child
          poly.push(child);
          console.log('last child', !!node.children[i+1]);
          var childCollectTo = (node.children[i+1]) ?  node.children[i+1].bi : node.bi;
          console.log('from %s to %s', child.bi, childCollectTo);
          for (var j = child.bi; j<=childCollectTo; j++) {
            poly.push(that.point(j));
          }
        }

        recurse(child)
      });


      if (!odd) {
        poly.push(that.point(node.bi));
        ret.push(Polygon(poly));
      }
    };

    recurse(root);

console.log(ret);

    return ret;
  },

  get length() {
    return this.points.length
  },

  clone : function() {
    var points = [];
    this.each(function(p, c) {
      points.push(c.clone());
    });
    return new Polygon(points);
  },

  rotate: function(rads, origin, returnNew) {
    origin = origin || this.center();

    var obj = (returnNew) ? this.clone() : this;

    return obj.each(function(p, c) {
      c.subtract(origin).rotate(rads).add(origin);
    });
  },

  translate : function(vec2, returnNew) {
    var obj = (returnNew) ? this.clone() : this;

    obj.each(function(p, c) {
      c.add(vec2);
    });

    return obj;
  },

  equal : function(poly) {
    var current = poly.length;

    while(current--) {
      if (!this.point(current).equal(poly.point(current))) {
        return false;
      }
    }
    return true;
  },


  containsCircle : function(x, y, radius) {
    var position = new Vec2(x, y);

    // Confirm that the x,y is inside of our bounds
    if (!this.containsPoint(position)) {
      return false;
    }

    var closestPoint = this.closestPointTo(position);

    if (closestPoint.distance(position) >= radius) {
      return true;
    }
  },

  contains : function(thing) {

    if (!thing) {
      return false;
    }

    // Other circles
    if (defined(thing.radius) && thing.position) {
      var radius;
      if (isFunction(thing.radius)) {
        radius = thing.radius();
      } else {
        radius = thing.radius;
      }

      return this.containsCircle(thing.position.x, thing.position.y, radius);

    } else if (typeof thing.points !== 'undefined') {

      var points, l;
      if (isFunction(thing.containsPolygon)) {
        points = thing.points;
      } else if (isArray(thing.points)) {
        points = thing.points;
      }

      return this.containsPolygon(points);

    } else if (
      defined(thing.x1) &&
      defined(thing.x2) &&
      defined(thing.y1) &&
      defined(thing.y2)
    ) {
      return this.containsPolygon([
        new Vec2(thing.x1, thing.y1),
        new Vec2(thing.x2, thing.y1),
        new Vec2(thing.x2, thing.y2),
        new Vec2(thing.x1, thing.y2)
      ]);

    } else if (defined(thing.x) && defined(thing.y)) {

      var x2, y2;

      if (defined(thing.w) && defined(thing.h)) {
        x2 = thing.x+thing.w;
        y2 = thing.y+thing.h;
      }

      if (defined(thing.width) && defined(thing.height)) {
        x2 = thing.x+thing.width;
        y2 = thing.y+thing.height;
      }

      return this.containsPolygon([
        new Vec2(thing.x, thing.y),
        new Vec2(x2, thing.y),
        new Vec2(x2, y2),
        new Vec2(thing.x, y2)
      ]);
    }

    return false;
  },

  toString : function() {
    return this.points.join(',');
  }

};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Polygon;
}

if (typeof window !== 'undefined') {
  window.Polygon = Polygon;
}
