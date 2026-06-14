import os
import sys
import importlib
import logging
from typing import Dict, Any, List

logger = logging.getLogger("diffusion-plugins")

class BasePeptidePlugin:
    """Base class that external developers must subclass to implement custom reward models or validators."""
    def __init__(self, name: str):
        self.name = name

    def evaluate_reward(self, sequence: str, latent_state: Any) -> float:
        """
        Evaluate a reward score (higher is better) for the generated candidate.
        Can be based on sequence character motifs, predicted physical features, or custom model inference.
        """
        return 0.0

    def get_metrics(self, sequence: str, latent_state: Any) -> Dict[str, float]:
        """Return a dictionary of custom metrics computed by this plugin."""
        return {}


class PluginManager:
    """Discovers, loads, and manages external developer plugins from the plugins directory."""
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.plugins: List[BasePeptidePlugin] = []
        self.plugin_dir = os.path.dirname(os.path.abspath(__file__))
        self.load_plugins()

    def load_plugins(self):
        """Dynamically imports and instantiates all python plugins found in the plugins directory."""
        self.plugins = []
        sys.path.insert(0, self.plugin_dir)
        
        for filename in os.listdir(self.plugin_dir):
            if filename.endswith(".py") and filename != "__init__.py":
                module_name = filename[:-3]
                try:
                    # Clear from sys.modules if already imported to allow reloading
                    if module_name in sys.modules:
                        importlib.reload(sys.modules[module_name])
                        module = sys.modules[module_name]
                    else:
                        module = importlib.import_module(module_name)
                    
                    # Find all classes that inherit from BasePeptidePlugin
                    for name in dir(module):
                        obj = getattr(module, name)
                        if isinstance(obj, type) and issubclass(obj, BasePeptidePlugin) and obj is not BasePeptidePlugin:
                            plugin_instance = obj()
                            self.plugins.append(plugin_instance)
                            logger.info(f"Successfully loaded peptide extension plugin: '{plugin_instance.name}'")
                except Exception as e:
                    logger.error(f"Failed to load plugin {filename}: {e}")

    def evaluate_all_rewards(self, sequence: str, latent_state: Any) -> tuple[float, Dict[str, float]]:
        """Evaluates all loaded plugins and aggregates their rewards and metrics."""
        total_plugin_reward = 0.0
        combined_metrics = {}
        
        for plugin in self.plugins:
            try:
                reward = plugin.evaluate_reward(sequence, latent_state)
                metrics = plugin.get_metrics(sequence, latent_state)
                total_plugin_reward += reward
                for k, v in metrics.items():
                    combined_metrics[f"plugin_{plugin.name.lower()}_{k}"] = v
            except Exception as e:
                logger.error(f"Error executing plugin {plugin.name}: {e}")
                
        return total_plugin_reward, combined_metrics
