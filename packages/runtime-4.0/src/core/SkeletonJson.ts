import type {
    Attachment,
    AttachmentLoader,
    MeshAttachment,
    VertexAttachment,
} from "./attachments";
import {
    AlphaTimeline,
    Animation,
    AttachmentTimeline,
    CurveTimeline,
    CurveTimeline1,
    CurveTimeline2,
    DeformTimeline,
    DrawOrderTimeline,
    EventTimeline,
    IkConstraintTimeline,
    PathConstraintMixTimeline,
    PathConstraintPositionTimeline,
    PathConstraintSpacingTimeline,
    RGB2Timeline,
    RGBA2Timeline,
    RGBATimeline,
    RGBTimeline,
    RotateTimeline,
    ScaleTimeline,
    ScaleXTimeline,
    ScaleYTimeline,
    ShearTimeline,
    ShearXTimeline,
    ShearYTimeline,
    Timeline,
    TransformConstraintTimeline,
    TranslateTimeline,
    TranslateXTimeline,
    TranslateYTimeline,
} from "./Animation";
import { Event } from "./Event";
import { SkeletonData } from "./SkeletonData";
import { SlotData } from "./SlotData";
import { BoneData } from "./BoneData";
import { IkConstraintData } from "./IkConstraintData";
import { TransformConstraintData } from "./TransformConstraintData";
import { PathConstraintData, SpacingMode } from "./PathConstraintData";
import { Skin } from "./Skin";
import { EventData } from "./EventData";
import {
    NumberArrayLike,
    Color,
    PositionMode,
    RotateMode,
    TransformMode,
    Utils,
    settings,
} from "@pixi-spine/base";

/** Loads skeleton data in the Spine JSON format.
 *
 * See [Spine JSON format](http://esotericsoftware.com/spine-json-format) and
 * [JSON and binary data](http://esotericsoftware.com/spine-loading-skeleton-data#JSON-and-binary-data) in the Spine
 * Runtimes Guide.
 * @public
 * */
export class SkeletonJson {
    attachmentLoader: AttachmentLoader = null;

    /** Scales bone positions, image sizes, and translations as they are loaded. This allows different size images to be used at
     * runtime than were used in Spine.
     *
     * See [Scaling](http://esotericsoftware.com/spine-loading-skeleton-data#Scaling) in the Spine Runtimes Guide. */
    scale = 1;
    private linkedMeshes = new Array<LinkedMesh>();

    constructor(attachmentLoader: AttachmentLoader) {
        this.attachmentLoader = attachmentLoader;
    }

    readSkeletonData(json: string | any): SkeletonData {
        let scale = this.scale;
        let skeletonData = new SkeletonData();
        let root = typeof json === "string" ? JSON.parse(json) : json;

        // Skeleton
        let skeletonMap = root.skeleton;
        if (skeletonMap) {
            skeletonData.hash = skeletonMap.hash;
            skeletonData.version = skeletonMap.spine;
            if (skeletonData.version.substr(0, 3) !== "4.0") {
                let error = `Spine 4.0 loader cant load version ${skeletonMap.spine}. Please configure your pixi-spine bundle`;
                console.error(error);
            }
            skeletonData.x = skeletonMap.x;
            skeletonData.y = skeletonMap.y;
            skeletonData.width = skeletonMap.width;
            skeletonData.height = skeletonMap.height;
            skeletonData.fps = skeletonMap.fps;
            skeletonData.imagesPath = skeletonMap.images;
        }

        // Bones
        if (root.bones) {
            for (let i = 0; i < root.bones.length; i++) {
                let boneMap = root.bones[i];

                let parent: BoneData = null;
                let parentName: string = getValue(boneMap, "parent", null);
                if (parentName != null) {
                    parent = skeletonData.findBone(parentName);
                    if (parent == null)
                        throw new Error("Parent bone not found: " + parentName);
                }
                let data = new BoneData(
                    skeletonData.bones.length,
                    boneMap.name,
                    parent
                );
                data.length = getValue(boneMap, "length", 0) * scale;
                data.x = getValue(boneMap, "x", 0) * scale;
                data.y = getValue(boneMap, "y", 0) * scale;
                data.rotation = getValue(boneMap, "rotation", 0);
                data.scaleX = getValue(boneMap, "scaleX", 1);
                data.scaleY = getValue(boneMap, "scaleY", 1);
                data.shearX = getValue(boneMap, "shearX", 0);
                data.shearY = getValue(boneMap, "shearY", 0);
                data.transformMode = Utils.enumValue(
                    TransformMode,
                    getValue(boneMap, "transform", "Normal")
                );
                data.skinRequired = getValue(boneMap, "skin", false);

                let color = getValue(boneMap, "color", null);
                if (color) data.color.setFromString(color);

                skeletonData.bones.push(data);
            }
        }

        // Slots.
        if (root.slots) {
            for (let i = 0; i < root.slots.length; i++) {
                let slotMap = root.slots[i];
                let boneData = skeletonData.findBone(slotMap.bone);
                let data = new SlotData(
                    skeletonData.slots.length,
                    slotMap.name,
                    boneData
                );

                let color: string = getValue(slotMap, "color", null);
                if (color) data.color.setFromString(color);

                let dark: string = getValue(slotMap, "dark", null);
                if (dark) data.darkColor = Color.fromString(dark);

                data.attachmentName = getValue(slotMap, "attachment", null);
                data.blendMode = SkeletonJson.blendModeFromString(
                    getValue(slotMap, "blend", "normal")
                );
                skeletonData.slots.push(data);
            }
        }

        // IK constraints
        if (root.ik) {
            for (let i = 0; i < root.ik.length; i++) {
                let constraintMap = root.ik[i];
                let data = new IkConstraintData(constraintMap.name);
                data.order = getValue(constraintMap, "order", 0);
                data.skinRequired = getValue(constraintMap, "skin", false);

                for (let ii = 0; ii < constraintMap.bones.length; ii++) {
                    let boneName = constraintMap.bones[ii];
                    let bone = skeletonData.findBone(boneName);
                    if (bone == null)
                        throw new Error("IK bone not found: " + boneName);
                    data.bones.push(bone);
                }

                data.target = skeletonData.findBone(constraintMap.target);

                data.mix = getValue(constraintMap, "mix", 1);
                data.softness = getValue(constraintMap, "softness", 0) * scale;
                data.bendDirection = getValue(
                    constraintMap,
                    "bendPositive",
                    true
                )
                    ? 1
                    : -1;
                data.compress = getValue(constraintMap, "compress", false);
                data.stretch = getValue(constraintMap, "stretch", false);
                data.uniform = getValue(constraintMap, "uniform", false);

                skeletonData.ikConstraints.push(data);
            }
        }

        // Transform constraints.
        if (root.transform) {
            for (let i = 0; i < root.transform.length; i++) {
                let constraintMap = root.transform[i];
                let data = new TransformConstraintData(constraintMap.name);
                data.order = getValue(constraintMap, "order", 0);
                data.skinRequired = getValue(constraintMap, "skin", false);

                for (let ii = 0; ii < constraintMap.bones.length; ii++) {
                    let boneName = constraintMap.bones[ii];
                    let bone = skeletonData.findBone(boneName);
                    if (bone == null)
                        throw new Error(
                            "Transform constraint bone not found: " + boneName
                        );
                    data.bones.push(bone);
                }

                let targetName: string = constraintMap.target;
                data.target = skeletonData.findBone(targetName);
                if (data.target == null)
                    throw new Error(
                        "Transform constraint target bone not found: " +
                            targetName
                    );

                data.local = getValue(constraintMap, "local", false);
                data.relative = getValue(constraintMap, "relative", false);
                data.offsetRotation = getValue(constraintMap, "rotation", 0);
                data.offsetX = getValue(constraintMap, "x", 0) * scale;
                data.offsetY = getValue(constraintMap, "y", 0) * scale;
                data.offsetScaleX = getValue(constraintMap, "scaleX", 0);
                data.offsetScaleY = getValue(constraintMap, "scaleY", 0);
                data.offsetShearY = getValue(constraintMap, "shearY", 0);

                data.mixRotate = getValue(constraintMap, "mixRotate", 1);
                data.mixX = getValue(constraintMap, "mixX", 1);
                data.mixY = getValue(constraintMap, "mixY", data.mixX);
                data.mixScaleX = getValue(constraintMap, "mixScaleX", 1);
                data.mixScaleY = getValue(
                    constraintMap,
                    "mixScaleY",
                    data.mixScaleX
                );
                data.mixShearY = getValue(constraintMap, "mixShearY", 1);

                skeletonData.transformConstraints.push(data);
            }
        }

        // Path constraints.
        if (root.path) {
            for (let i = 0; i < root.path.length; i++) {
                let constraintMap = root.path[i];
                let data = new PathConstraintData(constraintMap.name);
                data.order = getValue(constraintMap, "order", 0);
                data.skinRequired = getValue(constraintMap, "skin", false);

                for (let ii = 0; ii < constraintMap.bones.length; ii++) {
                    let boneName = constraintMap.bones[ii];
                    let bone = skeletonData.findBone(boneName);
                    if (bone == null)
                        throw new Error(
                            "Transform constraint bone not found: " + boneName
                        );
                    data.bones.push(bone);
                }

                let targetName: string = constraintMap.target;
                data.target = skeletonData.findSlot(targetName);
                if (data.target == null)
                    throw new Error(
                        "Path target slot not found: " + targetName
                    );

                data.positionMode = Utils.enumValue(
                    PositionMode,
                    getValue(constraintMap, "positionMode", "Percent")
                );
                data.spacingMode = Utils.enumValue(
                    SpacingMode,
                    getValue(constraintMap, "spacingMode", "Length")
                );
                data.rotateMode = Utils.enumValue(
                    RotateMode,
                    getValue(constraintMap, "rotateMode", "Tangent")
                );
                data.offsetRotation = getValue(constraintMap, "rotation", 0);
                data.position = getValue(constraintMap, "position", 0);
                if (data.positionMode == PositionMode.Fixed)
                    data.position *= scale;
                data.spacing = getValue(constraintMap, "spacing", 0);
                if (
                    data.spacingMode == SpacingMode.Length ||
                    data.spacingMode == SpacingMode.Fixed
                )
                    data.spacing *= scale;
                data.mixRotate = getValue(constraintMap, "mixRotate", 1);
                data.mixX = getValue(constraintMap, "mixX", 1);
                data.mixY = getValue(constraintMap, "mixY", data.mixX);

                skeletonData.pathConstraints.push(data);
            }
        }

        // Skins.
        if (root.skins) {
            for (let i = 0; i < root.skins.length; i++) {
                let skinMap = root.skins[i];
                let skin = new Skin(skinMap.name);

                if (skinMap.bones) {
                    for (let ii = 0; ii < skinMap.bones.length; ii++) {
                        let bone = skeletonData.findBone(skinMap.bones[ii]);
                        if (bone == null)
                            throw new Error(
                                "Skin bone not found: " + skinMap.bones[i]
                            );
                        skin.bones.push(bone);
                    }
                }

                if (skinMap.ik) {
                    for (let ii = 0; ii < skinMap.ik.length; ii++) {
                        let constraint = skeletonData.findIkConstraint(
                            skinMap.ik[ii]
                        );
                        if (constraint == null)
                            throw new Error(
                                "Skin IK constraint not found: " + skinMap.ik[i]
                            );
                        skin.constraints.push(constraint);
                    }
                }

                if (skinMap.transform) {
                    for (let ii = 0; ii < skinMap.transform.length; ii++) {
                        let constraint = skeletonData.findTransformConstraint(
                            skinMap.transform[ii]
                        );
                        if (constraint == null)
                            throw new Error(
                                "Skin transform constraint not found: " +
                                    skinMap.transform[i]
                            );
                        skin.constraints.push(constraint);
                    }
                }

                if (skinMap.path) {
                    for (let ii = 0; ii < skinMap.path.length; ii++) {
                        let constraint = skeletonData.findPathConstraint(
                            skinMap.path[ii]
                        );
                        if (constraint == null)
                            throw new Error(
                                "Skin path constraint not found: " +
                                    skinMap.path[i]
                            );
                        skin.constraints.push(constraint);
                    }
                }

                for (let slotName in skinMap.attachments) {
                    let slot = skeletonData.findSlot(slotName);
                    if (slot == null)
                        throw new Error("Slot not found: " + slotName);
                    let slotMap = skinMap.attachments[slotName];
                    for (let entryName in slotMap) {
                        let attachment = this.readAttachment(
                            slotMap[entryName],
                            skin,
                            slot.index,
                            entryName,
                            skeletonData
                        );
                        if (attachment)
                            skin.setAttachment(
                                slot.index,
                                entryName,
                                attachment
                            );
                    }
                }
                skeletonData.skins.push(skin);
                if (skin.name == "default") skeletonData.defaultSkin = skin;
            }
        }

        // Linked meshes.
        for (let i = 0, n = this.linkedMeshes.length; i < n; i++) {
            let linkedMesh = this.linkedMeshes[i];
            let skin = !linkedMesh.skin
                ? skeletonData.defaultSkin
                : skeletonData.findSkin(linkedMesh.skin);
            let parent = skin.getAttachment(
                linkedMesh.slotIndex,
                linkedMesh.parent
            );
            linkedMesh.mesh.deformAttachment = linkedMesh.inheritDeform
                ? <VertexAttachment>parent
                : <VertexAttachment>linkedMesh.mesh;
            linkedMesh.mesh.setParentMesh(<MeshAttachment>parent);
            // linkedMesh.mesh.updateUVs();
        }
        this.linkedMeshes.length = 0;

        // Events.
        if (root.events) {
            for (let eventName in root.events) {
                let eventMap = root.events[eventName];
                let data = new EventData(eventName);
                data.intValue = getValue(eventMap, "int", 0);
                data.floatValue = getValue(eventMap, "float", 0);
                data.stringValue = getValue(eventMap, "string", "");
                data.audioPath = getValue(eventMap, "audio", null);
                if (data.audioPath) {
                    data.volume = getValue(eventMap, "volume", 1);
                    data.balance = getValue(eventMap, "balance", 0);
                }
                skeletonData.events.push(data);
            }
        }

        // Animations.
        if (root.animations) {
            for (let animationName in root.animations) {
                let animationMap = root.animations[animationName];
                this.readAnimation(animationMap, animationName, skeletonData);
            }
        }

        return skeletonData;
    }

    readAttachment(
        map: any,
        skin: Skin,
        slotIndex: number,
        name: string,
        skeletonData: SkeletonData
    ): Attachment {
        let scale = this.scale;
        name = getValue(map, "name", name);

        switch (getValue(map, "type", "region")) {
            case "region": {
                let path = getValue(map, "path", name);
                let region = this.attachmentLoader.newRegionAttachment(
                    skin,
                    name,
                    path
                );
                if (!region) return null;
                region.path = path;
                region.x = getValue(map, "x", 0) * scale;
                region.y = getValue(map, "y", 0) * scale;
                region.scaleX = getValue(map, "scaleX", 1);
                region.scaleY = getValue(map, "scaleY", 1);
                region.rotation = getValue(map, "rotation", 0);
                region.width = map.width * scale;
                region.height = map.height * scale;

                let color: string = getValue(map, "color", null);
                if (color) region.color.setFromString(color);

                // region.updateOffset();
                return region;
            }
            case "boundingbox": {
                let box = this.attachmentLoader.newBoundingBoxAttachment(
                    skin,
                    name
                );
                if (!box) return null;
                this.readVertices(map, box, map.vertexCount << 1);
                let color: string = getValue(map, "color", null);
                if (color) box.color.setFromString(color);
                return box;
            }
            case "mesh":
            case "linkedmesh": {
                let path = getValue(map, "path", name);
                let mesh = this.attachmentLoader.newMeshAttachment(
                    skin,
                    name,
                    path
                );
                if (!mesh) return null;
                mesh.path = path;

                let color = getValue(map, "color", null);
                if (color) mesh.color.setFromString(color);

                mesh.width = getValue(map, "width", 0) * scale;
                mesh.height = getValue(map, "height", 0) * scale;

                let parent: string = getValue(map, "parent", null);
                if (parent) {
                    this.linkedMeshes.push(
                        new LinkedMesh(
                            mesh,
                            <string>getValue(map, "skin", null),
                            slotIndex,
                            parent,
                            getValue(map, "deform", true)
                        )
                    );
                    return mesh;
                }

                let uvs: Array<number> = map.uvs;
                this.readVertices(map, mesh, uvs.length);
                mesh.triangles = map.triangles;
                mesh.regionUVs = new Float32Array(uvs);
                // mesh.updateUVs();

                mesh.edges = getValue(map, "edges", null);
                mesh.hullLength = getValue(map, "hull", 0) * 2;
                return mesh;
            }
            case "path": {
                let path = this.attachmentLoader.newPathAttachment(skin, name);
                if (!path) return null;
                path.closed = getValue(map, "closed", false);
                path.constantSpeed = getValue(map, "constantSpeed", true);

                let vertexCount = map.vertexCount;
                this.readVertices(map, path, vertexCount << 1);

                let lengths: Array<number> = Utils.newArray(vertexCount / 3, 0);
                for (let i = 0; i < map.lengths.length; i++)
                    lengths[i] = map.lengths[i] * scale;
                path.lengths = lengths;

                let color: string = getValue(map, "color", null);
                if (color) path.color.setFromString(color);
                return path;
            }
            case "point": {
                let point = this.attachmentLoader.newPointAttachment(
                    skin,
                    name
                );
                if (!point) return null;
                point.x = getValue(map, "x", 0) * scale;
                point.y = getValue(map, "y", 0) * scale;
                point.rotation = getValue(map, "rotation", 0);

                let color = getValue(map, "color", null);
                if (color) point.color.setFromString(color);
                return point;
            }
            case "clipping": {
                let clip = this.attachmentLoader.newClippingAttachment(
                    skin,
                    name
                );
                if (!clip) return null;

                let end = getValue(map, "end", null);
                if (end != null) {
                    let slot = skeletonData.findSlot(end);
                    if (slot == null)
                        throw new Error("Clipping end slot not found: " + end);
                    clip.endSlot = slot;
                }

                let vertexCount = map.vertexCount;
                this.readVertices(map, clip, vertexCount << 1);

                let color: string = getValue(map, "color", null);
                if (color) clip.color.setFromString(color);
                return clip;
            }
        }
        return null;
    }

    readVertices(
        map: any,
        attachment: VertexAttachment,
        verticesLength: number
    ) {
        let scale = this.scale;
        attachment.worldVerticesLength = verticesLength;
        let vertices: Array<number> = map.vertices;
        if (verticesLength == vertices.length) {
            let scaledVertices = Utils.toFloatArray(vertices);
            if (scale != 1) {
                for (let i = 0, n = vertices.length; i < n; i++)
                    scaledVertices[i] *= scale;
            }
            attachment.vertices = scaledVertices;
            return;
        }
        let weights = new Array<number>();
        let bones = new Array<number>();
        for (let i = 0, n = vertices.length; i < n; ) {
            let boneCount = vertices[i++];
            bones.push(boneCount);
            for (let nn = i + boneCount * 4; i < nn; i += 4) {
                bones.push(vertices[i]);
                weights.push(vertices[i + 1] * scale);
                weights.push(vertices[i + 2] * scale);
                weights.push(vertices[i + 3]);
            }
        }
        attachment.bones = bones;
        attachment.vertices = Utils.toFloatArray(weights);
    }

    readAnimation(map: any, name: string, skeletonData: SkeletonData) {
        let scale = this.scale;
        let timelines = new Array<Timeline>();

        // Slot timelines.
        if (map.slots) {
            for (let slotName in map.slots) {
                let slotMap = map.slots[slotName];
                let slotIndex = skeletonData.findSlot(slotName).index;
                if (slotIndex == -1)
                    throw new Error("Slot not found: " + slotName);
                for (let timelineName in slotMap) {
                    let timelineMap = slotMap[timelineName];
                    if (!timelineMap) continue;
                    let frames = timelineMap.length;
                    if (timelineName == "attachment") {
                        let timeline = new AttachmentTimeline(
                            frames,
                            slotIndex
                        );
                        for (let frame = 0; frame < frames; frame++) {
                            let keyMap = timelineMap[frame];
                            timeline.setFrame(
                                frame,
                                getValue(keyMap, "time", 0),
                                keyMap.name
                            );
                        }
                        timelines.push(timeline);
                    } else if (timelineName == "rgba") {
                        let timeline = new RGBATimeline(
                            frames,
                            frames << 2,
                            slotIndex
                        );
                        let keyMap = timelineMap[0];
                        let time = getValue(keyMap, "time", 0);
                        let color = Color.fromString(keyMap.color);

                        for (let frame = 0, bezier = 0; ; frame++) {
                            timeline.setFrame(
                                frame,
                                time,
                                color.r,
                                color.g,
                                color.b,
                                color.a
                            );
                            let nextMap = timelineMap[frame + 1];
                            if (!nextMap) {
                                timeline.shrink(bezier);
                                break;
                            }
                            let time2 = getValue(nextMap, "time", 0);
                            let newColor = Color.fromString(nextMap.color);
                            let curve = keyMap.curve;
                            if (curve) {
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    0,
                                    time,
                                    time2,
                                    color.r,
                                    newColor.r,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    1,
                                    time,
                                    time2,
                                    color.g,
                                    newColor.g,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    2,
                                    time,
                                    time2,
                                    color.b,
                                    newColor.b,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    3,
                                    time,
                                    time2,
                                    color.a,
                                    newColor.a,
                                    1
                                );
                            }
                            time = time2;
                            color = newColor;
                            keyMap = nextMap;
                        }

                        timelines.push(timeline);
                    } else if (timelineName == "rgb") {
                        let timeline = new RGBTimeline(
                            frames,
                            frames * 3,
                            slotIndex
                        );
                        let keyMap = timelineMap[0];
                        let time = getValue(keyMap, "time", 0);
                        let color = Color.fromString(keyMap.color);

                        for (let frame = 0, bezier = 0; ; frame++) {
                            timeline.setFrame(
                                frame,
                                time,
                                color.r,
                                color.g,
                                color.b
                            );
                            let nextMap = timelineMap[frame + 1];
                            if (!nextMap) {
                                timeline.shrink(bezier);
                                break;
                            }
                            let time2 = getValue(nextMap, "time", 0);
                            let newColor = Color.fromString(nextMap.color);
                            let curve = keyMap.curve;
                            if (curve) {
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    0,
                                    time,
                                    time2,
                                    color.r,
                                    newColor.r,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    1,
                                    time,
                                    time2,
                                    color.g,
                                    newColor.g,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    2,
                                    time,
                                    time2,
                                    color.b,
                                    newColor.b,
                                    1
                                );
                            }
                            time = time2;
                            color = newColor;
                            keyMap = nextMap;
                        }

                        timelines.push(timeline);
                    } else if (timelineName == "alpha") {
                        timelines.push(
                            readTimeline1(
                                timelineMap,
                                new AlphaTimeline(frames, frames, slotIndex),
                                0,
                                1
                            )
                        );
                    } else if (timelineName == "rgba2") {
                        let timeline = new RGBA2Timeline(
                            frames,
                            frames * 7,
                            slotIndex
                        );

                        let keyMap = timelineMap[0];
                        let time = getValue(keyMap, "time", 0);
                        let color = Color.fromString(keyMap.light);
                        let color2 = Color.fromString(keyMap.dark);

                        for (let frame = 0, bezier = 0; ; frame++) {
                            timeline.setFrame(
                                frame,
                                time,
                                color.r,
                                color.g,
                                color.b,
                                color.a,
                                color2.r,
                                color2.g,
                                color2.b
                            );
                            let nextMap = timelineMap[frame + 1];
                            if (!nextMap) {
                                timeline.shrink(bezier);
                                break;
                            }
                            let time2 = getValue(nextMap, "time", 0);
                            let newColor = Color.fromString(nextMap.light);
                            let newColor2 = Color.fromString(nextMap.dark);
                            let curve = keyMap.curve;
                            if (curve) {
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    0,
                                    time,
                                    time2,
                                    color.r,
                                    newColor.r,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    1,
                                    time,
                                    time2,
                                    color.g,
                                    newColor.g,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    2,
                                    time,
                                    time2,
                                    color.b,
                                    newColor.b,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    3,
                                    time,
                                    time2,
                                    color.a,
                                    newColor.a,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    4,
                                    time,
                                    time2,
                                    color2.r,
                                    newColor2.r,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    5,
                                    time,
                                    time2,
                                    color2.g,
                                    newColor2.g,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    6,
                                    time,
                                    time2,
                                    color2.b,
                                    newColor2.b,
                                    1
                                );
                            }
                            time = time2;
                            color = newColor;
                            color2 = newColor2;
                            keyMap = nextMap;
                        }

                        timelines.push(timeline);
                    } else if (timelineName == "rgb2") {
                        let timeline = new RGB2Timeline(
                            frames,
                            frames * 6,
                            slotIndex
                        );

                        let keyMap = timelineMap[0];
                        let time = getValue(keyMap, "time", 0);
                        let color = Color.fromString(keyMap.light);
                        let color2 = Color.fromString(keyMap.dark);

                        for (let frame = 0, bezier = 0; ; frame++) {
                            timeline.setFrame(
                                frame,
                                time,
                                color.r,
                                color.g,
                                color.b,
                                color2.r,
                                color2.g,
                                color2.b
                            );
                            let nextMap = timelineMap[frame + 1];
                            if (!nextMap) {
                                timeline.shrink(bezier);
                                break;
                            }
                            let time2 = getValue(nextMap, "time", 0);
                            let newColor = Color.fromString(nextMap.light);
                            let newColor2 = Color.fromString(nextMap.dark);
                            let curve = keyMap.curve;
                            if (curve) {
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    0,
                                    time,
                                    time2,
                                    color.r,
                                    newColor.r,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    1,
                                    time,
                                    time2,
                                    color.g,
                                    newColor.g,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    2,
                                    time,
                                    time2,
                                    color.b,
                                    newColor.b,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    3,
                                    time,
                                    time2,
                                    color2.r,
                                    newColor2.r,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    4,
                                    time,
                                    time2,
                                    color2.g,
                                    newColor2.g,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    5,
                                    time,
                                    time2,
                                    color2.b,
                                    newColor2.b,
                                    1
                                );
                            }
                            time = time2;
                            color = newColor;
                            color2 = newColor2;
                            keyMap = nextMap;
                        }

                        timelines.push(timeline);
                    } else
                        throw new Error(
                            "Invalid timeline type for a slot: " +
                                timelineName +
                                " (" +
                                slotName +
                                ")"
                        );
                }
            }
        }

        // Bone timelines.
        if (map.bones) {
            for (let boneName in map.bones) {
                let boneMap = map.bones[boneName];
                let boneIndex = skeletonData.findBone(boneName).index;
                if (boneIndex == -1)
                    throw new Error("Bone not found: " + boneName);
                for (let timelineName in boneMap) {
                    let timelineMap = boneMap[timelineName];
                    let frames = timelineMap.length;
                    if (frames == 0) continue;

                    if (timelineName === "rotate") {
                        timelines.push(
                            readTimeline1(
                                timelineMap,
                                new RotateTimeline(frames, frames, boneIndex),
                                0,
                                1
                            )
                        );
                    } else if (timelineName === "translate") {
                        let timeline = new TranslateTimeline(
                            frames,
                            frames << 1,
                            boneIndex
                        );
                        timelines.push(
                            readTimeline2(
                                timelineMap,
                                timeline,
                                "x",
                                "y",
                                0,
                                scale
                            )
                        );
                    } else if (timelineName === "translatex") {
                        let timeline = new TranslateXTimeline(
                            frames,
                            frames,
                            boneIndex
                        );
                        timelines.push(
                            readTimeline1(timelineMap, timeline, 0, scale)
                        );
                    } else if (timelineName === "translatey") {
                        let timeline = new TranslateYTimeline(
                            frames,
                            frames,
                            boneIndex
                        );
                        timelines.push(
                            readTimeline1(timelineMap, timeline, 0, scale)
                        );
                    } else if (timelineName === "scale") {
                        let timeline = new ScaleTimeline(
                            frames,
                            frames << 1,
                            boneIndex
                        );
                        timelines.push(
                            readTimeline2(timelineMap, timeline, "x", "y", 1, 1)
                        );
                    } else if (timelineName === "scalex") {
                        let timeline = new ScaleXTimeline(
                            frames,
                            frames,
                            boneIndex
                        );
                        timelines.push(
                            readTimeline1(timelineMap, timeline, 1, 1)
                        );
                    } else if (timelineName === "scaley") {
                        let timeline = new ScaleYTimeline(
                            frames,
                            frames,
                            boneIndex
                        );
                        timelines.push(
                            readTimeline1(timelineMap, timeline, 1, 1)
                        );
                    } else if (timelineName === "shear") {
                        let timeline = new ShearTimeline(
                            frames,
                            frames << 1,
                            boneIndex
                        );
                        timelines.push(
                            readTimeline2(timelineMap, timeline, "x", "y", 0, 1)
                        );
                    } else if (timelineName === "shearx") {
                        let timeline = new ShearXTimeline(
                            frames,
                            frames,
                            boneIndex
                        );
                        timelines.push(
                            readTimeline1(timelineMap, timeline, 0, 1)
                        );
                    } else if (timelineName === "sheary") {
                        let timeline = new ShearYTimeline(
                            frames,
                            frames,
                            boneIndex
                        );
                        timelines.push(
                            readTimeline1(timelineMap, timeline, 0, 1)
                        );
                    }
                }
            }
        }

        // IK constraint timelines.
        if (map.ik) {
            for (let constraintName in map.ik) {
                let constraintMap = map.ik[constraintName];
                let keyMap = constraintMap[0];
                if (!keyMap) continue;

                let constraint = skeletonData.findIkConstraint(constraintName);
                let constraintIndex =
                    skeletonData.ikConstraints.indexOf(constraint);
                let timeline = new IkConstraintTimeline(
                    constraintMap.length,
                    constraintMap.length << 1,
                    constraintIndex
                );

                let time = getValue(keyMap, "time", 0);
                let mix = getValue(keyMap, "mix", 1);
                let softness = getValue(keyMap, "softness", 0) * scale;

                for (let frame = 0, bezier = 0; ; frame++) {
                    timeline.setFrame(
                        frame,
                        time,
                        mix,
                        softness,
                        getValue(keyMap, "bendPositive", true) ? 1 : -1,
                        getValue(keyMap, "compress", false),
                        getValue(keyMap, "stretch", false)
                    );
                    let nextMap = constraintMap[frame + 1];
                    if (!nextMap) {
                        timeline.shrink(bezier);
                        break;
                    }

                    let time2 = getValue(nextMap, "time", 0);
                    let mix2 = getValue(nextMap, "mix", 1);
                    let softness2 = getValue(nextMap, "softness", 0) * scale;
                    let curve = keyMap.curve;
                    if (curve) {
                        bezier = readCurve(
                            curve,
                            timeline,
                            bezier,
                            frame,
                            0,
                            time,
                            time2,
                            mix,
                            mix2,
                            1
                        );
                        bezier = readCurve(
                            curve,
                            timeline,
                            bezier,
                            frame,
                            1,
                            time,
                            time2,
                            softness,
                            softness2,
                            scale
                        );
                    }

                    time = time2;
                    mix = mix2;
                    softness = softness2;
                    keyMap = nextMap;
                }
                timelines.push(timeline);
            }
        }

        // Transform constraint timelines.
        if (map.transform) {
            for (let constraintName in map.transform) {
                let timelineMap = map.transform[constraintName];
                let keyMap = timelineMap[0];
                if (!keyMap) continue;

                let constraint =
                    skeletonData.findTransformConstraint(constraintName);
                let constraintIndex =
                    skeletonData.transformConstraints.indexOf(constraint);
                let timeline = new TransformConstraintTimeline(
                    timelineMap.length,
                    timelineMap.length * 6,
                    constraintIndex
                );

                let time = getValue(keyMap, "time", 0);
                let mixRotate = getValue(keyMap, "mixRotate", 1);
                let mixX = getValue(keyMap, "mixX", 1);
                let mixY = getValue(keyMap, "mixY", mixX);
                let mixScaleX = getValue(keyMap, "mixScaleX", 1);
                let mixScaleY = getValue(keyMap, "mixScaleY", mixScaleX);
                let mixShearY = getValue(keyMap, "mixShearY", 1);

                for (let frame = 0, bezier = 0; ; frame++) {
                    timeline.setFrame(
                        frame,
                        time,
                        mixRotate,
                        mixX,
                        mixY,
                        mixScaleX,
                        mixScaleY,
                        mixShearY
                    );
                    let nextMap = timelineMap[frame + 1];
                    if (!nextMap) {
                        timeline.shrink(bezier);
                        break;
                    }

                    let time2 = getValue(nextMap, "time", 0);
                    let mixRotate2 = getValue(nextMap, "mixRotate", 1);
                    let mixX2 = getValue(nextMap, "mixX", 1);
                    let mixY2 = getValue(nextMap, "mixY", mixX2);
                    let mixScaleX2 = getValue(nextMap, "mixScaleX", 1);
                    let mixScaleY2 = getValue(nextMap, "mixScaleY", mixScaleX2);
                    let mixShearY2 = getValue(nextMap, "mixShearY", 1);
                    let curve = keyMap.curve;
                    if (curve) {
                        bezier = readCurve(
                            curve,
                            timeline,
                            bezier,
                            frame,
                            0,
                            time,
                            time2,
                            mixRotate,
                            mixRotate2,
                            1
                        );
                        bezier = readCurve(
                            curve,
                            timeline,
                            bezier,
                            frame,
                            1,
                            time,
                            time2,
                            mixX,
                            mixX2,
                            1
                        );
                        bezier = readCurve(
                            curve,
                            timeline,
                            bezier,
                            frame,
                            2,
                            time,
                            time2,
                            mixY,
                            mixY2,
                            1
                        );
                        bezier = readCurve(
                            curve,
                            timeline,
                            bezier,
                            frame,
                            3,
                            time,
                            time2,
                            mixScaleX,
                            mixScaleX2,
                            1
                        );
                        bezier = readCurve(
                            curve,
                            timeline,
                            bezier,
                            frame,
                            4,
                            time,
                            time2,
                            mixScaleY,
                            mixScaleY2,
                            1
                        );
                        bezier = readCurve(
                            curve,
                            timeline,
                            bezier,
                            frame,
                            5,
                            time,
                            time2,
                            mixShearY,
                            mixShearY2,
                            1
                        );
                    }

                    time = time2;
                    mixRotate = mixRotate2;
                    mixX = mixX2;
                    mixY = mixY2;
                    mixScaleX = mixScaleX2;
                    mixScaleY = mixScaleY2;
                    mixScaleX = mixScaleX2;
                    keyMap = nextMap;
                }
                timelines.push(timeline);
            }
        }

        // Path constraint timelines.
        if (map.path) {
            for (let constraintName in map.path) {
                let constraintMap = map.path[constraintName];
                let constraintIndex =
                    skeletonData.findPathConstraintIndex(constraintName);
                if (constraintIndex == -1)
                    throw new Error(
                        "Path constraint not found: " + constraintName
                    );
                let constraint = skeletonData.pathConstraints[constraintIndex];
                for (let timelineName in constraintMap) {
                    let timelineMap = constraintMap[timelineName];
                    let keyMap = timelineMap[0];
                    if (!keyMap) continue;

                    let frames = timelineMap.length;
                    if (timelineName === "position") {
                        let timeline = new PathConstraintPositionTimeline(
                            frames,
                            frames,
                            constraintIndex
                        );
                        timelines.push(
                            readTimeline1(
                                timelineMap,
                                timeline,
                                0,
                                constraint.positionMode == PositionMode.Fixed
                                    ? scale
                                    : 1
                            )
                        );
                    } else if (timelineName === "spacing") {
                        let timeline = new PathConstraintSpacingTimeline(
                            frames,
                            frames,
                            constraintIndex
                        );
                        timelines.push(
                            readTimeline1(
                                timelineMap,
                                timeline,
                                0,
                                constraint.spacingMode == SpacingMode.Length ||
                                    constraint.spacingMode == SpacingMode.Fixed
                                    ? scale
                                    : 1
                            )
                        );
                    } else if (timelineName === "mix") {
                        let timeline = new PathConstraintMixTimeline(
                            frames,
                            frames * 3,
                            constraintIndex
                        );
                        let time = getValue(keyMap, "time", 0);
                        let mixRotate = getValue(keyMap, "mixRotate", 1);
                        let mixX = getValue(keyMap, "mixX", 1);
                        let mixY = getValue(keyMap, "mixY", mixX);
                        for (let frame = 0, bezier = 0; ; frame++) {
                            timeline.setFrame(
                                frame,
                                time,
                                mixRotate,
                                mixX,
                                mixY
                            );
                            let nextMap = timelineMap[frame + 1];
                            if (!nextMap) {
                                timeline.shrink(bezier);
                                break;
                            }
                            let time2 = getValue(nextMap, "time", 0);
                            let mixRotate2 = getValue(nextMap, "mixRotate", 1);
                            let mixX2 = getValue(nextMap, "mixX", 1);
                            let mixY2 = getValue(nextMap, "mixY", mixX2);
                            let curve = keyMap.curve;
                            if (curve) {
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    0,
                                    time,
                                    time2,
                                    mixRotate,
                                    mixRotate2,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    1,
                                    time,
                                    time2,
                                    mixX,
                                    mixX2,
                                    1
                                );
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    2,
                                    time,
                                    time2,
                                    mixY,
                                    mixY2,
                                    1
                                );
                            }
                            time = time2;
                            mixRotate = mixRotate2;
                            mixX = mixX2;
                            mixY = mixY2;
                            keyMap = nextMap;
                        }
                        timelines.push(timeline);
                    }
                }
            }
        }

        // Deform timelines.
        if (map.deform) {
            for (let deformName in map.deform) {
                let deformMap = map.deform[deformName];
                let skin = skeletonData.findSkin(deformName);
                if (skin == null) {
                    if (settings.FAIL_ON_NON_EXISTING_SKIN) {
                        throw new Error("Skin not found: " + deformName);
                    } else {
                        continue;
                    }
                }
                for (let slotName in deformMap) {
                    let slotMap = deformMap[slotName];
                    let slotIndex = skeletonData.findSlot(slotName).index;
                    for (let timelineName in slotMap) {
                        let timelineMap = slotMap[timelineName];
                        let keyMap = timelineMap[0];
                        if (!keyMap) continue;

                        let attachment = <VertexAttachment>(
                            skin.getAttachment(slotIndex, timelineName)
                        );
                        let weighted = attachment.bones;
                        let vertices = attachment.vertices;
                        let deformLength = weighted
                            ? (vertices.length / 3) * 2
                            : vertices.length;

                        let timeline = new DeformTimeline(
                            timelineMap.length,
                            timelineMap.length,
                            slotIndex,
                            attachment
                        );
                        let time = getValue(keyMap, "time", 0);
                        for (let frame = 0, bezier = 0; ; frame++) {
                            let deform: NumberArrayLike;
                            let verticesValue: Array<Number> = getValue(
                                keyMap,
                                "vertices",
                                null
                            );
                            if (!verticesValue)
                                deform = weighted
                                    ? Utils.newFloatArray(deformLength)
                                    : vertices;
                            else {
                                deform = Utils.newFloatArray(deformLength);
                                let start = <number>(
                                    getValue(keyMap, "offset", 0)
                                );
                                Utils.arrayCopy(
                                    verticesValue,
                                    0,
                                    deform,
                                    start,
                                    verticesValue.length
                                );
                                if (scale != 1) {
                                    for (
                                        let i = start,
                                            n = i + verticesValue.length;
                                        i < n;
                                        i++
                                    )
                                        deform[i] *= scale;
                                }
                                if (!weighted) {
                                    for (let i = 0; i < deformLength; i++)
                                        deform[i] += vertices[i];
                                }
                            }

                            timeline.setFrame(frame, time, deform);
                            let nextMap = timelineMap[frame + 1];
                            if (!nextMap) {
                                timeline.shrink(bezier);
                                break;
                            }
                            let time2 = getValue(nextMap, "time", 0);
                            let curve = keyMap.curve;
                            if (curve)
                                bezier = readCurve(
                                    curve,
                                    timeline,
                                    bezier,
                                    frame,
                                    0,
                                    time,
                                    time2,
                                    0,
                                    1,
                                    1
                                );
                            time = time2;
                            keyMap = nextMap;
                        }
                        timelines.push(timeline);
                    }
                }
            }
        }

        // Draw order timelines.
        if (map.drawOrder) {
            let timeline = new DrawOrderTimeline(map.drawOrder.length);
            let slotCount = skeletonData.slots.length;
            let frame = 0;
            for (let i = 0; i < map.drawOrder.length; i++, frame++) {
                let drawOrderMap = map.drawOrder[i];
                let drawOrder: Array<number> = null;
                let offsets = getValue(drawOrderMap, "offsets", null);
                if (offsets) {
                    drawOrder = Utils.newArray<number>(slotCount, -1);
                    let unchanged = Utils.newArray<number>(
                        slotCount - offsets.length,
                        0
                    );
                    let originalIndex = 0,
                        unchangedIndex = 0;
                    for (let ii = 0; ii < offsets.length; ii++) {
                        let offsetMap = offsets[ii];
                        let slotIndex = skeletonData.findSlot(
                            offsetMap.slot
                        ).index;
                        // Collect unchanged items.
                        while (originalIndex != slotIndex)
                            unchanged[unchangedIndex++] = originalIndex++;
                        // Set changed items.
                        drawOrder[originalIndex + offsetMap.offset] =
                            originalIndex++;
                    }
                    // Collect remaining unchanged items.
                    while (originalIndex < slotCount)
                        unchanged[unchangedIndex++] = originalIndex++;
                    // Fill in unchanged items.
                    for (let ii = slotCount - 1; ii >= 0; ii--)
                        if (drawOrder[ii] == -1)
                            drawOrder[ii] = unchanged[--unchangedIndex];
                }
                timeline.setFrame(
                    frame,
                    getValue(drawOrderMap, "time", 0),
                    drawOrder
                );
            }
            timelines.push(timeline);
        }

        // Event timelines.
        if (map.events) {
            let timeline = new EventTimeline(map.events.length);
            let frame = 0;
            for (let i = 0; i < map.events.length; i++, frame++) {
                let eventMap = map.events[i];
                let eventData = skeletonData.findEvent(eventMap.name);
                let event = new Event(
                    Utils.toSinglePrecision(getValue(eventMap, "time", 0)),
                    eventData
                );
                event.intValue = getValue(eventMap, "int", eventData.intValue);
                event.floatValue = getValue(
                    eventMap,
                    "float",
                    eventData.floatValue
                );
                event.stringValue = getValue(
                    eventMap,
                    "string",
                    eventData.stringValue
                );
                if (event.data.audioPath) {
                    event.volume = getValue(eventMap, "volume", 1);
                    event.balance = getValue(eventMap, "balance", 0);
                }
                timeline.setFrame(frame, event);
            }
            timelines.push(timeline);
        }

        let duration = 0;
        for (let i = 0, n = timelines.length; i < n; i++)
            duration = Math.max(duration, timelines[i].getDuration());
        if (isNaN(duration)) {
            throw new Error("Error while parsing animation, duration is NaN");
        }

        skeletonData.animations.push(new Animation(name, timelines, duration));
    }
    static blendModeFromString(str: string) {
        str = str.toLowerCase();
        if (str == "normal") return PIXI.BLEND_MODES.NORMAL;
        if (str == "additive") return PIXI.BLEND_MODES.ADD;
        if (str == "multiply") return PIXI.BLEND_MODES.MULTIPLY;
        if (str == "screen") return PIXI.BLEND_MODES.SCREEN;
        throw new Error(`Unknown blend mode: ${str}`);
    }
}

class LinkedMesh {
    parent: string;
    skin: string;
    slotIndex: number;
    mesh: MeshAttachment;
    inheritDeform: boolean;

    constructor(
        mesh: MeshAttachment,
        skin: string,
        slotIndex: number,
        parent: string,
        inheritDeform: boolean
    ) {
        this.mesh = mesh;
        this.skin = skin;
        this.slotIndex = slotIndex;
        this.parent = parent;
        this.inheritDeform = inheritDeform;
    }
}

function readTimeline1(
    keys: any[],
    timeline: CurveTimeline1,
    defaultValue: number,
    scale: number
) {
    let keyMap = keys[0];
    let time = getValue(keyMap, "time", 0);
    let value = getValue(keyMap, "value", defaultValue) * scale;
    let bezier = 0;
    for (let frame = 0; ; frame++) {
        timeline.setFrame(frame, time, value);
        let nextMap = keys[frame + 1];
        if (!nextMap) {
            timeline.shrink(bezier);
            return timeline;
        }
        let time2 = getValue(nextMap, "time", 0);
        let value2 = getValue(nextMap, "value", defaultValue) * scale;
        if (keyMap.curve)
            bezier = readCurve(
                keyMap.curve,
                timeline,
                bezier,
                frame,
                0,
                time,
                time2,
                value,
                value2,
                scale
            );
        time = time2;
        value = value2;
        keyMap = nextMap;
    }
}

function readTimeline2(
    keys: any[],
    timeline: CurveTimeline2,
    name1: string,
    name2: string,
    defaultValue: number,
    scale: number
) {
    let keyMap = keys[0];
    let time = getValue(keyMap, "time", 0);
    let value1 = getValue(keyMap, name1, defaultValue) * scale;
    let value2 = getValue(keyMap, name2, defaultValue) * scale;
    let bezier = 0;
    for (let frame = 0; ; frame++) {
        timeline.setFrame(frame, time, value1, value2);
        let nextMap = keys[frame + 1];
        if (!nextMap) {
            timeline.shrink(bezier);
            return timeline;
        }
        let time2 = getValue(nextMap, "time", 0);
        let nvalue1 = getValue(nextMap, name1, defaultValue) * scale;
        let nvalue2 = getValue(nextMap, name2, defaultValue) * scale;
        let curve = keyMap.curve;
        if (curve) {
            bezier = readCurve(
                curve,
                timeline,
                bezier,
                frame,
                0,
                time,
                time2,
                value1,
                nvalue1,
                scale
            );
            bezier = readCurve(
                curve,
                timeline,
                bezier,
                frame,
                1,
                time,
                time2,
                value2,
                nvalue2,
                scale
            );
        }
        time = time2;
        value1 = nvalue1;
        value2 = nvalue2;
        keyMap = nextMap;
    }
}

function readCurve(
    curve: any,
    timeline: CurveTimeline,
    bezier: number,
    frame: number,
    value: number,
    time1: number,
    time2: number,
    value1: number,
    value2: number,
    scale: number
) {
    if (curve == "stepped") {
        timeline.setStepped(frame);
        return bezier;
    }
    let i = value << 2;
    let cx1 = curve[i];
    let cy1 = curve[i + 1] * scale;
    let cx2 = curve[i + 2];
    let cy2 = curve[i + 3] * scale;
    timeline.setBezier(
        bezier,
        frame,
        value,
        time1,
        value1,
        cx1,
        cy1,
        cx2,
        cy2,
        time2,
        value2
    );
    return bezier + 1;
}

function getValue(map: any, property: string, defaultValue: any) {
    return map[property] !== undefined ? map[property] : defaultValue;
}
