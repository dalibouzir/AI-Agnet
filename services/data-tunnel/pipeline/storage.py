from datetime import datetime
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from settings import get_settings

_settings = get_settings()
_s3_client = boto3.client(
    "s3",
    endpoint_url=_settings.s3_endpoint,
    aws_access_key_id=_settings.s3_access_key,
    aws_secret_access_key=_settings.s3_secret_key,
)


def _landing_prefix(tenant_id: str, ingest_id: str) -> str:
    now = datetime.utcnow()
    return f"{tenant_id}/landing/{now:%Y/%m/%d}/{ingest_id}"


def put_landing(tenant_id: str, ingest_id: str, data: bytes, filename: str) -> str:
    prefix = _landing_prefix(tenant_id, ingest_id)
    key = str(Path(prefix) / filename)
    _s3_client.put_object(Bucket=_settings.s3_bucket, Key=key, Body=data)
    return f"s3://{_settings.s3_bucket}/{key}"


def get_object(path: str) -> bytes:
    if not path.startswith("s3://"):
        raise ValueError("Only s3:// paths are supported")
    bucket, key = path.replace("s3://", "", 1).split("/", 1)
    response = _s3_client.get_object(Bucket=bucket, Key=key)
    return response["Body"].read()


def ensure_bucket() -> None:
    try:
        _s3_client.head_bucket(Bucket=_settings.s3_bucket)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "")
        if error_code in {"404", "NoSuchBucket", "NotFound"}:
            _s3_client.create_bucket(Bucket=_settings.s3_bucket)
        else:
            raise
