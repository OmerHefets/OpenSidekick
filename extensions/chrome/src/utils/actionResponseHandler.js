export function mapActionToTitle(action) {
    switch (action) {
        case "screenshot":
            return "📸 Taking a screenshot";
        case "leftClick":
        case "left_click":
            return "👆 Left click";
        case "doubleClick":
        case "double_click":
            return "👆👆 Double click";
        case "rightClick":
        case "right_click":
            return "👉 Right click";
        case "middleClick":
        case "middle_click":
            return "🖲️ Middle click";
        case "leftClickDrag":
        case "left_click_drag":
            return "🖱️➡️ Dragging with left click";
        case "tripleClick":
        case "triple_click":
            return "👆👆👆 Triple click";
        case "mouseMove":
        case "mouse_move":
            return "🖱️ Moving the mouse";
        case "typeText":
        case "type":
            return "⌨️ Typing text";
        case "scroll":
            return "🔽 Scrolling";
        case "pressKey":
        case "key":
            return "🎹 Pressing a key";
        case "holdKey":
        case "hold_key":
            return "🎹⏳ Holding a key";
        case "wait":
            return "🕒 Waiting";
        default:
            return "❓ Unknown action";
    }
}
