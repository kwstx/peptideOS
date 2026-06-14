import os
import json
import logging
import time
from confluent_kafka import Consumer, Producer, KafkaError
import psycopg2

from compiler import (
    generate_fasta,
    calculate_physicochemical_profile,
    generate_spps_script,
    generate_analytical_report,
    generate_python_template
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("synthesis-subsystem")

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
DB_HOST = os.getenv("DB_HOST", "postgres")
DB_NAME = os.getenv("DB_NAME", "peptiprompt")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASSWORD", "postgres")

consumer_config = {
    'bootstrap.servers': KAFKA_BOOTSTRAP_SERVERS,
    'group.id': 'synthesis-group',
    'auto.offset.reset': 'earliest'
}

def update_database_with_synthesis_outputs(design_id, fasta, spps_script, analytical_report, python_template):
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        cursor = conn.cursor()
        
        # Add columns if they don't exist
        new_cols = [
            ("fasta_repr", "TEXT"),
            ("analytical_report", "TEXT"),
            ("python_template", "TEXT")
        ]
        for col_name, col_type in new_cols:
            cursor.execute(f"ALTER TABLE designs ADD COLUMN IF NOT EXISTS {col_name} {col_type};")
            
        cursor.execute(
            """
            UPDATE designs 
            SET fasta_repr = %s, synthesis_script = %s, analytical_report = %s, python_template = %s, status = 'SYNTHESIS_READY'
            WHERE design_id = %s;
            """,
            (fasta, spps_script, analytical_report, python_template, design_id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        logger.info(f"Database updated successfully with synthesis outputs for {design_id}")
    except Exception as e:
        logger.error(f"Failed to update database for {design_id}: {e}")

def main():
    logger.info("Starting Synthesis-Ready Output Subsystem...")
    try:
        consumer = Consumer(consumer_config)
        consumer.subscribe(['validated-peptides'])
        logger.info("Subscribed to 'validated-peptides' topic.")
    except Exception as e:
        logger.error(f"Kafka connection failure: {e}")
        logger.info("Falling back to fallback mock mode.")
        while True:
            time.sleep(10)
            logger.info("Mock Synthesis Service tick - awaiting validated peptides...")
        return

    try:
        while True:
            msg = consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                else:
                    logger.error(f"Kafka error: {msg.error()}")
                    break

            try:
                data = json.loads(msg.value().decode('utf-8'))
                design_id = data.get("design_id")
                sequence = data.get("sequence")
                efficacy_scores = data.get("efficacy_scores", {})
                visualizations = data.get("visualizations", [])

                logger.info(f"[{design_id}] Processing sequence for synthesis: {sequence}")

                fasta = generate_fasta(sequence, design_id)
                profile = calculate_physicochemical_profile(sequence)
                spps_script = generate_spps_script(sequence, profile, design_id)
                analytical_report = generate_analytical_report(design_id, sequence, efficacy_scores, visualizations)
                python_template = generate_python_template(design_id, sequence)
                
                # Write to disk as exports
                export_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exports", design_id)
                os.makedirs(export_dir, exist_ok=True)
                
                with open(os.path.join(export_dir, f"{design_id}.fasta"), "w") as f:
                    f.write(fasta)
                with open(os.path.join(export_dir, f"{design_id}_spps.txt"), "w") as f:
                    f.write(spps_script)
                with open(os.path.join(export_dir, f"{design_id}_report.md"), "w") as f:
                    f.write(analytical_report)
                with open(os.path.join(export_dir, f"{design_id}_analysis.py"), "w") as f:
                    f.write(python_template)
                    
                update_database_with_synthesis_outputs(design_id, fasta, spps_script, analytical_report, python_template)

                logger.info(f"[{design_id}] Synthesis outputs generated and exported successfully.")

            except Exception as e:
                logger.error(f"Error handling message: {e}")

    except KeyboardInterrupt:
        pass
    finally:
        consumer.close()

if __name__ == "__main__":
    main()
