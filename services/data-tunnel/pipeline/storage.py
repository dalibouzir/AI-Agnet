import json
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Tuple

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


def _object_prefix(tenant_id: str, ingest_id: str, variant: str) -> PurePosixPath:
    safe_variant = variant.strip("/ ")
    if not safe_variant:
        safe_variant = "raw"
    return PurePosixPath(tenant_id) / "landing" / ingest_id / safe_variant


def _normalize_filename(filename: str | None, fallback: str = "upload.bin") -> str:
    name = (filename or "").strip()
    if not name:
        return fallback
    normalized = Path(name).name
    return normalized or fallback


def _put_bytes(key: str, data: bytes, content_type: str | None = None) -> str:
    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type
    _s3_client.put_object(Bucket=_settings.s3_bucket, Key=key, Body=data, **extra_args)
    return f"s3://{_settings.s3_bucket}/{key}"


def put_raw_object(
    tenant_id: str,
    ingest_id: str,
    data: bytes,
    filename: str | None,
) -> Tuple[str, str]:
    name = _normalize_filename(filename)
    key = str(_object_prefix(tenant_id, ingest_id, "raw") / name)
    uri = _put_bytes(key, data)
    return uri, key


def put_redacted_text(
    tenant_id: str,
    ingest_id: str,
    text: str,
    filename: str | None,
    *,
    encoding: str = "utf-8",
    content_type: str = "text/plain",
) -> Tuple[str, str]:
    base_name = Path(_normalize_filename(filename)).with_suffix(".txt").name
    key = str(_object_prefix(tenant_id, ingest_id, "redacted") / base_name)
    uri = _put_bytes(key, text.encode(encoding), content_type=content_type)
    return uri, key


def put_manifest(
    tenant_id: str,
    ingest_id: str,
    payload: Dict[str, Any],
) -> Tuple[str, str]:
    key = str(_object_prefix(tenant_id, ingest_id, "metadata") / "manifest.json")
    uri = _put_bytes(key, json.dumps(payload, ensure_ascii=False).encode("utf-8"), content_type="application/json")
    return uri, key


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


def delete_ingest_objects(tenant_id: str, ingest_id: str) -> None:
    prefix = f"{tenant_id}/landing/{ingest_id}/"
    continuation_token = None
    while True:
        kwargs = {"Bucket": _settings.s3_bucket, "Prefix": prefix}
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token
        response = _s3_client.list_objects_v2(**kwargs)
        contents = response.get("Contents", [])
        if not contents:
            break
        for item in contents:
            key = item.get("Key")
            if key:
                _s3_client.delete_object(Bucket=_settings.s3_bucket, Key=key)
        if response.get("IsTruncated"):
            continuation_token = response.get("NextContinuationToken")
        else:
            break


def generate_presigned_download(key: str, expires_in: int = 900) -> str:
    return _s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": _settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )
