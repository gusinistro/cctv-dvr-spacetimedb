"""Creates deterministic ONNX fixtures for local worker tests; not production models."""
from pathlib import Path
import sys
import onnx
from onnx import TensorProto, helper


def constant_model(output_name: str, output_shape: list[int], values: list[float], destination: Path) -> None:
    input_info = helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, 640, 640])
    output_info = helper.make_tensor_value_info(output_name, TensorProto.FLOAT, output_shape)
    values_tensor = helper.make_tensor("result", TensorProto.FLOAT, output_shape, values)
    node = helper.make_node("Constant", inputs=[], outputs=[output_name], value=values_tensor)
    graph = helper.make_graph([node], "spacevision_test", [input_info], [output_info])
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 9
    onnx.save(model, destination)


def main() -> None:
    directory = Path(sys.argv[1]).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    constant_model("detections", [1, 5], [320, 320, 120, 160, 0.93], directory / "objects.onnx")
    constant_model("activities", [2], [0.1, 0.9], directory / "activities.onnx")


if __name__ == "__main__":
    main()
