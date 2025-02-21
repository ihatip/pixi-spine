import { Updatable } from "./Updatable";
import { BoneData } from "./BoneData";
import { Skeleton } from "./Skeleton";
import {
    IBone,
    MathUtils,
    settings,
    TransformMode,
    Vector2,
} from "@pixi-spine/base";

/** Stores a bone's current pose.
 *
 * A bone has a local transform which is used to compute its world transform. A bone also has an applied transform, which is a
 * local transform that can be applied to compute the world transform. The local transform and applied transform may differ if a
 * constraint or application code modifies the world transform after it was computed from the local transform.
 * @public
 * */
export class Bone implements Updatable, IBone {
    //be careful! Spine b,c is c,b in pixi matrix
    matrix = new PIXI.Matrix();

    get worldX(): number {
        return this.matrix.tx;
    }

    get worldY(): number {
        return this.matrix.ty;
    }

    /** The bone's setup pose data. */
    data: BoneData;

    /** The skeleton this bone belongs to. */
    skeleton: Skeleton;

    /** The parent bone, or null if this is the root bone. */
    parent: Bone;

    /** The immediate children of this bone. */
    children = new Array<Bone>();

    /** The local x translation. */
    x = 0;

    /** The local y translation. */
    y = 0;

    /** The local rotation in degrees, counter clockwise. */
    rotation = 0;

    /** The local scaleX. */
    scaleX = 0;

    /** The local scaleY. */
    scaleY = 0;

    /** The local shearX. */
    shearX = 0;

    /** The local shearY. */
    shearY = 0;

    /** The applied local x translation. */
    ax = 0;

    /** The applied local y translation. */
    ay = 0;

    /** The applied local rotation in degrees, counter clockwise. */
    arotation = 0;

    /** The applied local scaleX. */
    ascaleX = 0;

    /** The applied local scaleY. */
    ascaleY = 0;

    /** The applied local shearX. */
    ashearX = 0;

    /** The applied local shearY. */
    ashearY = 0;

    sorted = false;
    active = false;

    /** @param parent May be null. */
    constructor(data: BoneData, skeleton: Skeleton, parent: Bone) {
        if (!data) throw new Error("data cannot be null.");
        if (!skeleton) throw new Error("skeleton cannot be null.");
        this.data = data;
        this.skeleton = skeleton;
        this.parent = parent;
        this.setToSetupPose();
    }

    /** Returns false when the bone has not been computed because {@link BoneData#skinRequired} is true and the
     * {@link Skeleton#skin active skin} does not {@link Skin#bones contain} this bone. */
    isActive() {
        return this.active;
    }

    /** Computes the world transform using the parent bone and this bone's local applied transform. */
    update() {
        this.updateWorldTransformWith(
            this.ax,
            this.ay,
            this.arotation,
            this.ascaleX,
            this.ascaleY,
            this.ashearX,
            this.ashearY
        );
    }

    /** Computes the world transform using the parent bone and this bone's local transform.
     *
     * See {@link #updateWorldTransformWith()}. */
    updateWorldTransform() {
        this.updateWorldTransformWith(
            this.x,
            this.y,
            this.rotation,
            this.scaleX,
            this.scaleY,
            this.shearX,
            this.shearY
        );
    }

    /** Computes the world transform using the parent bone and the specified local transform. The applied transform is set to the
     * specified local transform. Child bones are not updated.
     *
     * See [World transforms](http://esotericsoftware.com/spine-runtime-skeletons#World-transforms) in the Spine
     * Runtimes Guide. */
    updateWorldTransformWith(
        x: number,
        y: number,
        rotation: number,
        scaleX: number,
        scaleY: number,
        shearX: number,
        shearY: number
    ) {
        this.ax = x;
        this.ay = y;
        this.arotation = rotation;
        this.ascaleX = scaleX;
        this.ascaleY = scaleY;
        this.ashearX = shearX;
        this.ashearY = shearY;

        let parent = this.parent;
        let m = this.matrix;

        let sx = this.skeleton.scaleX;
        let sy = settings.yDown ? -this.skeleton.scaleY : this.skeleton.scaleY;
        if (!parent) {
            // Root bone.
            let skeleton = this.skeleton;
            let rotationY = rotation + 90 + shearY;
            m.a = MathUtils.cosDeg(rotation + shearX) * scaleX * sx;
            m.c = MathUtils.cosDeg(rotationY) * scaleY * sx;
            m.b = MathUtils.sinDeg(rotation + shearX) * scaleX * sy;
            m.d = MathUtils.sinDeg(rotationY) * scaleY * sy;
            m.tx = x * sx + skeleton.x;
            m.ty = y * sy + skeleton.y;
            return;
        }

        let pa = parent.matrix.a,
            pb = parent.matrix.c,
            pc = parent.matrix.b,
            pd = parent.matrix.d;
        m.tx = pa * x + pb * y + parent.matrix.tx;
        m.ty = pc * x + pd * y + parent.matrix.ty;

        switch (this.data.transformMode) {
            case TransformMode.Normal: {
                let rotationY = rotation + 90 + shearY;
                let la = MathUtils.cosDeg(rotation + shearX) * scaleX;
                let lb = MathUtils.cosDeg(rotationY) * scaleY;
                let lc = MathUtils.sinDeg(rotation + shearX) * scaleX;
                let ld = MathUtils.sinDeg(rotationY) * scaleY;
                m.a = pa * la + pb * lc;
                m.c = pa * lb + pb * ld;
                m.b = pc * la + pd * lc;
                m.d = pc * lb + pd * ld;
                return;
            }
            case TransformMode.OnlyTranslation: {
                let rotationY = rotation + 90 + shearY;
                m.a = MathUtils.cosDeg(rotation + shearX) * scaleX;
                m.c = MathUtils.cosDeg(rotationY) * scaleY;
                m.b = MathUtils.sinDeg(rotation + shearX) * scaleX;
                m.d = MathUtils.sinDeg(rotationY) * scaleY;
                break;
            }
            case TransformMode.NoRotationOrReflection: {
                let s = pa * pa + pc * pc;
                let prx = 0;
                if (s > 0.0001) {
                    s = Math.abs(pa * pd - pb * pc) / s;
                    pa /= this.skeleton.scaleX;
                    pc /= this.skeleton.scaleY;
                    pb = pc * s;
                    pd = pa * s;
                    prx = Math.atan2(pc, pa) * MathUtils.radDeg;
                } else {
                    pa = 0;
                    pc = 0;
                    prx = 90 - Math.atan2(pd, pb) * MathUtils.radDeg;
                }
                let rx = rotation + shearX - prx;
                let ry = rotation + shearY - prx + 90;
                let la = MathUtils.cosDeg(rx) * scaleX;
                let lb = MathUtils.cosDeg(ry) * scaleY;
                let lc = MathUtils.sinDeg(rx) * scaleX;
                let ld = MathUtils.sinDeg(ry) * scaleY;
                m.a = pa * la - pb * lc;
                m.c = pa * lb - pb * ld;
                m.b = pc * la + pd * lc;
                m.d = pc * lb + pd * ld;
                break;
            }
            case TransformMode.NoScale:
            case TransformMode.NoScaleOrReflection: {
                let cos = MathUtils.cosDeg(rotation);
                let sin = MathUtils.sinDeg(rotation);
                let za = (pa * cos + pb * sin) / sx;
                let zc = (pc * cos + pd * sin) / sy;
                let s = Math.sqrt(za * za + zc * zc);
                if (s > 0.00001) s = 1 / s;
                za *= s;
                zc *= s;
                s = Math.sqrt(za * za + zc * zc);
                if (
                    this.data.transformMode == TransformMode.NoScale &&
                    pa * pd - pb * pc < 0 !=
                        (settings.yDown
                            ? this.skeleton.scaleX < 0 !=
                              this.skeleton.scaleY > 0
                            : this.skeleton.scaleX < 0 !=
                              this.skeleton.scaleY < 0)
                )
                    s = -s;
                let r = Math.PI / 2 + Math.atan2(zc, za);
                let zb = Math.cos(r) * s;
                let zd = Math.sin(r) * s;
                let la = MathUtils.cosDeg(shearX) * scaleX;
                let lb = MathUtils.cosDeg(90 + shearY) * scaleY;
                let lc = MathUtils.sinDeg(shearX) * scaleX;
                let ld = MathUtils.sinDeg(90 + shearY) * scaleY;
                m.a = za * la + zb * lc;
                m.c = za * lb + zb * ld;
                m.b = zc * la + zd * lc;
                m.d = zc * lb + zd * ld;
                break;
            }
        }
        m.a *= sx;
        m.c *= sx;
        m.b *= sy;
        m.d *= sy;
    }

    /** Sets this bone's local transform to the setup pose. */
    setToSetupPose() {
        let data = this.data;
        this.x = data.x;
        this.y = data.y;
        this.rotation = data.rotation;
        this.scaleX = data.scaleX;
        this.scaleY = data.scaleY;
        this.shearX = data.shearX;
        this.shearY = data.shearY;
    }

    /** The world rotation for the X axis, calculated using {@link #a} and {@link #c}. */
    getWorldRotationX() {
        return Math.atan2(this.matrix.b, this.matrix.a) * MathUtils.radDeg;
    }

    /** The world rotation for the Y axis, calculated using {@link #b} and {@link #d}. */
    getWorldRotationY() {
        return Math.atan2(this.matrix.d, this.matrix.c) * MathUtils.radDeg;
    }

    /** The magnitude (always positive) of the world scale X, calculated using {@link #a} and {@link #c}. */
    getWorldScaleX() {
        let m = this.matrix;
        return Math.sqrt(m.a * m.a + m.b * m.b);
    }

    /** The magnitude (always positive) of the world scale Y, calculated using {@link #b} and {@link #d}. */
    getWorldScaleY() {
        let m = this.matrix;
        return Math.sqrt(m.c * m.c + m.d * m.d);
    }

    /** Computes the applied transform values from the world transform.
     *
     * If the world transform is modified (by a constraint, {@link #rotateWorld(float)}, etc) then this method should be called so
     * the applied transform matches the world transform. The applied transform may be needed by other code (eg to apply other
     * constraints).
     *
     * Some information is ambiguous in the world transform, such as -1,-1 scale versus 180 rotation. The applied transform after
     * calling this method is equivalent to the local transform used to compute the world transform, but may not be identical. */
    updateAppliedTransform() {
        let parent = this.parent;
        let m = this.matrix;
        if (!parent) {
            this.ax = m.tx;
            this.ay = m.ty;
            this.arotation = Math.atan2(m.b, m.a) * MathUtils.radDeg;
            this.ascaleX = Math.sqrt(m.a * m.a + m.b * m.b);
            this.ascaleY = Math.sqrt(m.c * m.c + m.d * m.d);
            this.ashearX = 0;
            this.ashearY =
                Math.atan2(m.a * m.c + m.b * m.d, m.a * m.d - m.b * m.c) *
                MathUtils.radDeg;
            return;
        }
        let pm = parent.matrix;
        let pid = 1 / (pm.a * pm.d - pm.b * pm.c);
        let dx = m.tx - pm.tx,
            dy = m.ty - pm.ty;
        this.ax = dx * pm.d * pid - dy * pm.c * pid;
        this.ay = dy * pm.a * pid - dx * pm.b * pid;
        let ia = pid * pm.d;
        let id = pid * pm.a;
        let ib = pid * pm.c;
        let ic = pid * pm.b;
        let ra = ia * m.a - ib * m.b;
        let rb = ia * m.c - ib * m.d;
        let rc = id * m.b - ic * m.a;
        let rd = id * m.d - ic * m.c;
        this.ashearX = 0;
        this.ascaleX = Math.sqrt(ra * ra + rc * rc);
        if (this.ascaleX > 0.0001) {
            let det = ra * rd - rb * rc;
            this.ascaleY = det / this.ascaleX;
            this.ashearY =
                Math.atan2(ra * rb + rc * rd, det) * MathUtils.radDeg;
            this.arotation = Math.atan2(rc, ra) * MathUtils.radDeg;
        } else {
            this.ascaleX = 0;
            this.ascaleY = Math.sqrt(rb * rb + rd * rd);
            this.ashearY = 0;
            this.arotation = 90 - Math.atan2(rd, rb) * MathUtils.radDeg;
        }
    }

    /** Transforms a point from world coordinates to the bone's local coordinates. */
    worldToLocal(world: Vector2) {
        let m = this.matrix;
        let a = m.a,
            b = m.c,
            c = m.b,
            d = m.d;
        let invDet = 1 / (a * d - b * c);
        let x = world.x - m.tx,
            y = world.y - m.ty;
        world.x = x * d * invDet - y * b * invDet;
        world.y = y * a * invDet - x * c * invDet;
        return world;
    }

    /** Transforms a point from the bone's local coordinates to world coordinates. */
    localToWorld(local: Vector2) {
        let m = this.matrix;
        let x = local.x,
            y = local.y;
        local.x = x * m.a + y * m.c + m.tx;
        local.y = x * m.b + y * m.d + m.ty;
        return local;
    }

    /** Transforms a world rotation to a local rotation. */
    worldToLocalRotation(worldRotation: number) {
        let sin = MathUtils.sinDeg(worldRotation),
            cos = MathUtils.cosDeg(worldRotation);
        let mat = this.matrix;
        return (
            Math.atan2(mat.a * sin - mat.b * cos, mat.d * cos - mat.c * sin) *
            MathUtils.radDeg
        );
    }

    /** Transforms a local rotation to a world rotation. */
    localToWorldRotation(localRotation: number) {
        localRotation -= this.rotation - this.shearX;
        let sin = MathUtils.sinDeg(localRotation),
            cos = MathUtils.cosDeg(localRotation);
        let mat = this.matrix;
        return (
            Math.atan2(cos * mat.b + sin * mat.d, cos * mat.a + sin * mat.c) *
            MathUtils.radDeg
        );
    }

    /** Rotates the world transform the specified amount.
     * <p>
     * After changes are made to the world transform, {@link #updateAppliedTransform()} should be called and {@link #update()} will
     * need to be called on any child bones, recursively. */
    rotateWorld(degrees: number) {
        let mat = this.matrix;
        let a = mat.a,
            b = mat.c,
            c = mat.b,
            d = mat.d;
        let cos = MathUtils.cosDeg(degrees),
            sin = MathUtils.sinDeg(degrees);
        mat.a = cos * a - sin * c;
        mat.c = cos * b - sin * d;
        mat.b = sin * a + cos * c;
        mat.d = sin * b + cos * d;
    }
}
