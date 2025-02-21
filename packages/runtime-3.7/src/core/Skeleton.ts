import {Attachment, RegionAttachment, MeshAttachment, PathAttachment} from './attachments';
import {Bone} from "./Bone";
import {Slot} from "./Slot";
import {Updatable} from "./Updatable";
import {SkeletonData} from "./SkeletonData";
import {IkConstraint} from "./IkConstraint";
import {TransformConstraint} from "./TransformConstraint";
import {PathConstraint} from "./PathConstraint";
import {Skin} from "./Skin";
import {Color, Utils, Vector2, ISkeleton} from "@pixi-spine/base";

/**
 * @public
 */
export class Skeleton implements ISkeleton<SkeletonData, Bone, Slot, Skin> {
    data: SkeletonData;
    bones: Array<Bone>;
    slots: Array<Slot>;
    drawOrder: Array<Slot>;
    ikConstraints: Array<IkConstraint>;
    transformConstraints: Array<TransformConstraint>;
    pathConstraints: Array<PathConstraint>;
    _updateCache = new Array<Updatable>();
    updateCacheReset = new Array<Updatable>();
    skin: Skin;
    color: Color;
    time = 0;
    scaleX = 1; scaleY = 1;
    x = 0; y = 0;

    constructor (data: SkeletonData) {
        if (data == null) throw new Error("data cannot be null.");
        this.data = data;

        this.bones = new Array<Bone>();
        for (let i = 0; i < data.bones.length; i++) {
            let boneData = data.bones[i];
            let bone: Bone;
            if (boneData.parent == null)
                bone = new Bone(boneData, this, null);
            else {
                let parent = this.bones[boneData.parent.index];
                bone = new Bone(boneData, this, parent);
                parent.children.push(bone);
            }
            this.bones.push(bone);
        }

        this.slots = new Array<Slot>();
        this.drawOrder = new Array<Slot>();
        for (let i = 0; i < data.slots.length; i++) {
            let slotData = data.slots[i];
            let bone = this.bones[slotData.boneData.index];
            let slot = new Slot(slotData, bone);
            this.slots.push(slot);
            this.drawOrder.push(slot);
        }

        this.ikConstraints = new Array<IkConstraint>();
        for (let i = 0; i < data.ikConstraints.length; i++) {
            let ikConstraintData = data.ikConstraints[i];
            this.ikConstraints.push(new IkConstraint(ikConstraintData, this));
        }

        this.transformConstraints = new Array<TransformConstraint>();
        for (let i = 0; i < data.transformConstraints.length; i++) {
            let transformConstraintData = data.transformConstraints[i];
            this.transformConstraints.push(new TransformConstraint(transformConstraintData, this));
        }

        this.pathConstraints = new Array<PathConstraint>();
        for (let i = 0; i < data.pathConstraints.length; i++) {
            let pathConstraintData = data.pathConstraints[i];
            this.pathConstraints.push(new PathConstraint(pathConstraintData, this));
        }

        this.color = new Color(1, 1, 1, 1);
        this.updateCache();
    }

    updateCache () {
        let updateCache = this._updateCache;
        updateCache.length = 0;
        this.updateCacheReset.length = 0;

        let bones = this.bones;
        for (let i = 0, n = bones.length; i < n; i++)
            bones[i].sorted = false;

        // IK first, lowest hierarchy depth first.
        let ikConstraints = this.ikConstraints;
        let transformConstraints = this.transformConstraints;
        let pathConstraints = this.pathConstraints;
        let ikCount = ikConstraints.length, transformCount = transformConstraints.length, pathCount = pathConstraints.length;
        let constraintCount = ikCount + transformCount + pathCount;

        outer:
            for (let i = 0; i < constraintCount; i++) {
                for (let ii = 0; ii < ikCount; ii++) {
                    let constraint = ikConstraints[ii];
                    if (constraint.data.order == i) {
                        this.sortIkConstraint(constraint);
                        continue outer;
                    }
                }
                for (let ii = 0; ii < transformCount; ii++) {
                    let constraint = transformConstraints[ii];
                    if (constraint.data.order == i) {
                        this.sortTransformConstraint(constraint);
                        continue outer;
                    }
                }
                for (let ii = 0; ii < pathCount; ii++) {
                    let constraint = pathConstraints[ii];
                    if (constraint.data.order == i) {
                        this.sortPathConstraint(constraint);
                        continue outer;
                    }
                }
            }

        for (let i = 0, n = bones.length; i < n; i++)
            this.sortBone(bones[i]);
    }

    sortIkConstraint (constraint: IkConstraint) {
        let target = constraint.target;
        this.sortBone(target);

        let constrained = constraint.bones;
        let parent = constrained[0];
        this.sortBone(parent);

        if (constrained.length > 1) {
            let child = constrained[constrained.length - 1];
            if (!(this._updateCache.indexOf(child) > -1)) this.updateCacheReset.push(child);
        }

        this._updateCache.push(constraint);

        this.sortReset(parent.children);
        constrained[constrained.length - 1].sorted = true;
    }

    sortPathConstraint (constraint: PathConstraint) {
        let slot = constraint.target;
        let slotIndex = slot.data.index;
        let slotBone = slot.bone;
        if (this.skin != null) this.sortPathConstraintAttachment(this.skin, slotIndex, slotBone);
        if (this.data.defaultSkin != null && this.data.defaultSkin != this.skin)
            this.sortPathConstraintAttachment(this.data.defaultSkin, slotIndex, slotBone);
        for (let i = 0, n = this.data.skins.length; i < n; i++)
            this.sortPathConstraintAttachment(this.data.skins[i], slotIndex, slotBone);

        let attachment = slot.getAttachment();
        if (attachment instanceof PathAttachment) this.sortPathConstraintAttachmentWith(attachment, slotBone);

        let constrained = constraint.bones;
        let boneCount = constrained.length;
        for (let i = 0; i < boneCount; i++)
            this.sortBone(constrained[i]);

        this._updateCache.push(constraint);

        for (let i = 0; i < boneCount; i++)
            this.sortReset(constrained[i].children);
        for (let i = 0; i < boneCount; i++)
            constrained[i].sorted = true;
    }

    sortTransformConstraint (constraint: TransformConstraint) {
        this.sortBone(constraint.target);

        let constrained = constraint.bones;
        let boneCount = constrained.length;
        if (constraint.data.local) {
            for (let i = 0; i < boneCount; i++) {
                let child = constrained[i];
                this.sortBone(child.parent);
                if (!(this._updateCache.indexOf(child) > -1)) this.updateCacheReset.push(child);
            }
        } else {
            for (let i = 0; i < boneCount; i++) {
                this.sortBone(constrained[i]);
            }
        }

        this._updateCache.push(constraint);

        for (let ii = 0; ii < boneCount; ii++)
            this.sortReset(constrained[ii].children);
        for (let ii = 0; ii < boneCount; ii++)
            constrained[ii].sorted = true;
    }

    sortPathConstraintAttachment (skin: Skin, slotIndex: number, slotBone: Bone) {
        let attachments = skin.attachments[slotIndex];
        if (!attachments) return;
        for (let key in attachments) {
            this.sortPathConstraintAttachmentWith(attachments[key], slotBone);
        }
    }

    sortPathConstraintAttachmentWith (attachment: Attachment, slotBone: Bone) {
        if (!(attachment instanceof PathAttachment)) return;
        let pathBones = (<PathAttachment>attachment).bones;
        if (pathBones == null)
            this.sortBone(slotBone);
        else {
            let bones = this.bones;
            let i = 0;
            while (i < pathBones.length) {
                let boneCount = pathBones[i++];
                for (let n = i + boneCount; i < n; i++) {
                    let boneIndex = pathBones[i];
                    this.sortBone(bones[boneIndex]);
                }
            }
        }
    }

    sortBone (bone: Bone) {
        if (bone.sorted) return;
        let parent = bone.parent;
        if (parent != null) this.sortBone(parent);
        bone.sorted = true;
        this._updateCache.push(bone);
    }

    sortReset (bones: Array<Bone>) {
        for (let i = 0, n = bones.length; i < n; i++) {
            let bone = bones[i];
            if (bone.sorted) this.sortReset(bone.children);
            bone.sorted = false;
        }
    }

    /** Updates the world transform for each bone and applies constraints. */
    updateWorldTransform () {
        let updateCacheReset = this.updateCacheReset;
        for (let i = 0, n = updateCacheReset.length; i < n; i++) {
            let bone = updateCacheReset[i] as Bone;
            bone.ax = bone.x;
            bone.ay = bone.y;
            bone.arotation = bone.rotation;
            bone.ascaleX = bone.scaleX;
            bone.ascaleY = bone.scaleY;
            bone.ashearX = bone.shearX;
            bone.ashearY = bone.shearY;
            bone.appliedValid = true;
        }
        let updateCache = this._updateCache;
        for (let i = 0, n = updateCache.length; i < n; i++)
            updateCache[i].update();
    }

    /** Sets the bones, constraints, and slots to their setup pose values. */
    setToSetupPose () {
        this.setBonesToSetupPose();
        this.setSlotsToSetupPose();
    }

    /** Sets the bones and constraints to their setup pose values. */
    setBonesToSetupPose () {
        let bones = this.bones;
        for (let i = 0, n = bones.length; i < n; i++)
            bones[i].setToSetupPose();

        let ikConstraints = this.ikConstraints;
        for (let i = 0, n = ikConstraints.length; i < n; i++) {
            let constraint = ikConstraints[i];
            constraint.bendDirection = constraint.data.bendDirection;
            constraint.mix = constraint.data.mix;
        }

        let transformConstraints = this.transformConstraints;
        for (let i = 0, n = transformConstraints.length; i < n; i++) {
            let constraint = transformConstraints[i];
            let data = constraint.data;
            constraint.rotateMix = data.rotateMix;
            constraint.translateMix = data.translateMix;
            constraint.scaleMix = data.scaleMix;
            constraint.shearMix = data.shearMix;
        }

        let pathConstraints = this.pathConstraints;
        for (let i = 0, n = pathConstraints.length; i < n; i++) {
            let constraint = pathConstraints[i];
            let data = constraint.data;
            constraint.position = data.position;
            constraint.spacing = data.spacing;
            constraint.rotateMix = data.rotateMix;
            constraint.translateMix = data.translateMix;
        }
    }

    setSlotsToSetupPose () {
        let slots = this.slots;
        Utils.arrayCopy(slots, 0, this.drawOrder, 0, slots.length);
        for (let i = 0, n = slots.length; i < n; i++)
            slots[i].setToSetupPose();
    }

    /** @return May return null. */
    getRootBone () {
        if (this.bones.length == 0) return null;
        return this.bones[0];
    }

    /** @return May be null. */
    findBone (boneName: string) {
        if (boneName == null) throw new Error("boneName cannot be null.");
        let bones = this.bones;
        for (let i = 0, n = bones.length; i < n; i++) {
            let bone = bones[i];
            if (bone.data.name == boneName) return bone;
        }
        return null;
    }

    /** @return -1 if the bone was not found. */
    findBoneIndex (boneName: string) {
        if (boneName == null) throw new Error("boneName cannot be null.");
        let bones = this.bones;
        for (let i = 0, n = bones.length; i < n; i++)
            if (bones[i].data.name == boneName) return i;
        return -1;
    }

    /** @return May be null. */
    findSlot (slotName: string) {
        if (slotName == null) throw new Error("slotName cannot be null.");
        let slots = this.slots;
        for (let i = 0, n = slots.length; i < n; i++) {
            let slot = slots[i];
            if (slot.data.name == slotName) return slot;
        }
        return null;
    }

    /** @return -1 if the bone was not found. */
    findSlotIndex (slotName: string) {
        if (slotName == null) throw new Error("slotName cannot be null.");
        let slots = this.slots;
        for (let i = 0, n = slots.length; i < n; i++)
            if (slots[i].data.name == slotName) return i;
        return -1;
    }

    /** Sets a skin by name.
     * @see #setSkin(Skin) */
    setSkinByName (skinName: string) {
        let skin = this.data.findSkin(skinName);
        if (skin == null) throw new Error("Skin not found: " + skinName);
        this.setSkin(skin);
    }

    /** Sets the skin used to look up attachments before looking in the {@link SkeletonData#getDefaultSkin() default skin}.
     * Attachments from the new skin are attached if the corresponding attachment from the old skin was attached. If there was no
     * old skin, each slot's setup mode attachment is attached from the new skin.
     * @param newSkin May be null. */
    setSkin (newSkin: Skin | null) {
        if (newSkin != null) {
            if (this.skin != null)
                newSkin.attachAll(this, this.skin);
            else {
                let slots = this.slots;
                for (let i = 0, n = slots.length; i < n; i++) {
                    let slot = slots[i];
                    let name = slot.data.attachmentName;
                    if (name != null) {
                        let attachment: Attachment = newSkin.getAttachment(i, name);
                        if (attachment != null) slot.setAttachment(attachment);
                    }
                }
            }
        }
        this.skin = newSkin;
    }

    /** @return May be null. */
    getAttachmentByName (slotName: string, attachmentName: string): Attachment {
        return this.getAttachment(this.data.findSlotIndex(slotName), attachmentName);
    }

    /** @return May be null. */
    getAttachment (slotIndex: number, attachmentName: string): Attachment {
        if (attachmentName == null) throw new Error("attachmentName cannot be null.");
        if (this.skin != null) {
            let attachment: Attachment = this.skin.getAttachment(slotIndex, attachmentName);
            if (attachment != null) return attachment;
        }
        if (this.data.defaultSkin != null) return this.data.defaultSkin.getAttachment(slotIndex, attachmentName);
        return null;
    }

    /** @param attachmentName May be null. */
    setAttachment (slotName: string, attachmentName: string) {
        if (slotName == null) throw new Error("slotName cannot be null.");
        let slots = this.slots;
        for (let i = 0, n = slots.length; i < n; i++) {
            let slot = slots[i];
            if (slot.data.name == slotName) {
                let attachment: Attachment = null;
                if (attachmentName != null) {
                    attachment = this.getAttachment(i, attachmentName);
                    if (attachment == null)
                        throw new Error("Attachment not found: " + attachmentName + ", for slot: " + slotName);
                }
                slot.setAttachment(attachment);
                return;
            }
        }
        throw new Error("Slot not found: " + slotName);
    }

    /** @return May be null. */
    findIkConstraint (constraintName: string) {
        if (constraintName == null) throw new Error("constraintName cannot be null.");
        let ikConstraints = this.ikConstraints;
        for (let i = 0, n = ikConstraints.length; i < n; i++) {
            let ikConstraint = ikConstraints[i];
            if (ikConstraint.data.name == constraintName) return ikConstraint;
        }
        return null;
    }

    /** @return May be null. */
    findTransformConstraint (constraintName: string) {
        if (constraintName == null) throw new Error("constraintName cannot be null.");
        let transformConstraints = this.transformConstraints;
        for (let i = 0, n = transformConstraints.length; i < n; i++) {
            let constraint = transformConstraints[i];
            if (constraint.data.name == constraintName) return constraint;
        }
        return null;
    }

    /** @return May be null. */
    findPathConstraint (constraintName: string) {
        if (constraintName == null) throw new Error("constraintName cannot be null.");
        let pathConstraints = this.pathConstraints;
        for (let i = 0, n = pathConstraints.length; i < n; i++) {
            let constraint = pathConstraints[i];
            if (constraint.data.name == constraintName) return constraint;
        }
        return null;
    }

    /** Returns the axis aligned bounding box (AABB) of the region and mesh attachments for the current pose.
     * @param offset The distance from the skeleton origin to the bottom left corner of the AABB.
     * @param size The width and height of the AABB.
     * @param temp Working memory */
    getBounds (offset: Vector2, size: Vector2, temp: Array<number>) {
        if (offset == null) throw new Error("offset cannot be null.");
        if (size == null) throw new Error("size cannot be null.");
        let drawOrder = this.drawOrder;
        let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
        for (let i = 0, n = drawOrder.length; i < n; i++) {
            let slot = drawOrder[i];
            let verticesLength = 0;
            let vertices: ArrayLike<number> = null;
            let attachment = slot.getAttachment();
            if (attachment instanceof RegionAttachment) {
                verticesLength = 8;
                vertices = Utils.setArraySize(temp, verticesLength, 0);
                (<RegionAttachment>attachment).computeWorldVertices(slot.bone, vertices, 0, 2);
            } else if (attachment instanceof MeshAttachment) {
                let mesh = (<MeshAttachment>attachment);
                verticesLength = mesh.worldVerticesLength;
                vertices = Utils.setArraySize(temp, verticesLength, 0);
                mesh.computeWorldVertices(slot, 0, verticesLength, vertices, 0, 2);
            }
            if (vertices != null) {
                for (let ii = 0, nn = vertices.length; ii < nn; ii += 2) {
                    let x = vertices[ii], y = vertices[ii + 1];
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        offset.set(minX, minY);
        size.set(maxX - minX, maxY - minY);
    }

    update (delta: number) {
        this.time += delta;
    }

    get flipX(): boolean {
        return this.scaleX == -1;
    }

    set flipX(value: boolean) {
        if (!Skeleton.deprecatedWarning1) {
            Skeleton.deprecatedWarning1 = true;
            console.warn("Spine Deprecation Warning: `Skeleton.flipX/flipY` was deprecated, please use scaleX/scaleY");
        }
        this.scaleX = value ? 1.0 : -1.0;
    }

    get flipY(): boolean {
        return this.scaleY == -1;
    }

    set flipY(value: boolean) {
        if (!Skeleton.deprecatedWarning1) {
            Skeleton.deprecatedWarning1 = true;
            console.warn("Spine Deprecation Warning: `Skeleton.flipX/flipY` was deprecated, please use scaleX/scaleY");
        }
        this.scaleY = value ? 1.0 : -1.0;
    }

    private static deprecatedWarning1: boolean = false;
}
